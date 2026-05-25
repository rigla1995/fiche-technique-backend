const pool = require('../config/database');
const { chatWithClaude } = require('./claudeService');
const { chatWithDeepSeek } = require('./deepseekService');
const { generateAndSendReport } = require('./reportService');

const GRAPH_API_URL = 'https://graph.facebook.com/v19.0/me/messages';

const REPORT_PATTERNS = [
  { format: 'excel', keywords: ['rapport excel', 'fichier excel', 'export excel', 'envoie excel'] },
  { format: 'pdf',   keywords: ['rapport pdf', 'fichier pdf', 'export pdf', 'envoie pdf'] },
];

function detectExplicitReportRequest(text) {
  const lower = text.toLowerCase();
  for (const { format, keywords } of REPORT_PATTERNS) {
    if (keywords.some(kw => lower.includes(kw))) return format;
  }
  return null;
}

// Strip Markdown for Messenger (plain text only)
function stripMarkdown(text) {
  return text
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/`(.*?)`/g, '$1')
    .replace(/^- /gm, '• ');
}

async function chatWithAI(clientId, sessionId, userMessage, confidenceThreshold) {
  if (process.env.ANTHROPIC_API_KEY) {
    return chatWithClaude(clientId, sessionId, userMessage, confidenceThreshold);
  }
  return chatWithDeepSeek(clientId, sessionId, userMessage, confidenceThreshold);
}

async function sendMessage(psid, text) {
  const token = process.env.MESSENGER_PAGE_ACCESS_TOKEN;
  if (!token) return;

  await fetch(`${GRAPH_API_URL}?access_token=${token}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipient: { id: psid },
      message: { text: stripMarkdown(text) },
    }),
  });
}

async function sendTypingOn(psid) {
  const token = process.env.MESSENGER_PAGE_ACCESS_TOKEN;
  if (!token) return;

  await fetch(`${GRAPH_API_URL}?access_token=${token}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipient: { id: psid },
      sender_action: 'typing_on',
    }),
  }).catch(() => {});
}

const findClientByMessengerToken = async (token) => {
  const { rows } = await pool.query(
    `SELECT aic.client_id, aic.confidence_threshold, u.nom, u.email
     FROM ai_assistant_config aic
     JOIN utilisateurs u ON u.id = aic.client_id
     WHERE aic.messenger_invite_token = $1 AND aic.enabled = true`,
    [token]
  );
  return rows[0] || null;
};

const findClientByPsid = async (psid) => {
  const { rows } = await pool.query(
    `SELECT aic.client_id, aic.confidence_threshold, u.nom, u.email
     FROM ai_assistant_config aic
     JOIN utilisateurs u ON u.id = aic.client_id
     WHERE aic.messenger_psid = $1 AND aic.enabled = true`,
    [psid]
  );
  return rows[0] || null;
};

async function handleMessengerEvent(event) {
  const psid = event.sender?.id;
  if (!psid) return;

  const messageText = event.message?.text?.trim();
  const postbackPayload = event.postback?.payload?.trim();

  const text = messageText || postbackPayload;
  if (!text) return;

  // Handle invite token from deep link (m.me/page?ref=TOKEN or postback with token)
  const refMatch = text.match(/^([a-f0-9]{48})$/i);
  if (refMatch) {
    const inviteToken = refMatch[1];
    const client = await findClientByMessengerToken(inviteToken);
    if (!client) {
      return sendMessage(psid, '❌ Lien expiré ou invalide. Contactez votre administrateur LabFlow.');
    }
    await pool.query(
      `UPDATE ai_assistant_config
       SET messenger_psid = $1, messenger_invite_token = NULL, updated_at = NOW()
       WHERE client_id = $2`,
      [psid, client.client_id]
    );
    return sendMessage(
      psid,
      `👋 Bonjour ${client.nom} !\n\nJe suis votre agent LabFlow. Je peux vous aider avec :\n\n` +
      `📦 Stock — état actuel, historique\n` +
      `🛒 Appros — approvisionnements et prix\n` +
      `📉 Pertes — suivi et analyse\n` +
      `📊 Inventaires — historique et écarts\n` +
      `🔄 Transferts — labo vers activités\n` +
      `📄 Rapports — Excel ou PDF par email\n\n` +
      `Posez-moi votre question !`
    );
  }

  const client = await findClientByPsid(psid);
  if (!client) return;

  await sendTypingOn(psid);

  try {
    const reportFormat = detectExplicitReportRequest(text);
    if (reportFormat && client.email) {
      await sendMessage(psid, `⏳ Génération de votre rapport ${reportFormat.toUpperCase()} en cours...`);
      try {
        const filename = await generateAndSendReport(client.client_id, client.email, client.nom, reportFormat);
        await sendMessage(psid, `✅ Rapport ${reportFormat.toUpperCase()} envoyé\n\n📧 Destinataire : ${client.email}\n📎 Fichier : ${filename}`);
      } catch (e) {
        console.error('[Messenger] Report error:', e.message);
        await sendMessage(psid, '❌ Erreur lors de la génération du rapport. Veuillez réessayer.');
      }
      return;
    }

    const sessionId = `messenger_${psid}`;
    const { assistantMessage, confidence } = await chatWithAI(
      client.client_id,
      sessionId,
      text,
      client.confidence_threshold
    );

    if (confidence !== null) {
      await pool.query(
        `UPDATE ai_conversations SET last_confidence = $1
         WHERE id = (
           SELECT id FROM ai_conversations
           WHERE client_id = $2 AND whatsapp_number = $3
           ORDER BY updated_at DESC LIMIT 1
         )`,
        [confidence, client.client_id, sessionId]
      );
    }

    await sendMessage(psid, assistantMessage);
  } catch (err) {
    console.error('[Messenger] handleEvent error:', err.message);
    await sendMessage(psid, '⚠️ Une erreur est survenue. Veuillez réessayer dans quelques instants.');
  }
}

// Webhook verification (GET)
function verifyWebhook(req, res) {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.MESSENGER_VERIFY_TOKEN) {
    console.log('[Messenger] Webhook vérifié');
    return res.status(200).send(challenge);
  }
  return res.status(403).send('Forbidden');
}

// Webhook events (POST)
async function receiveWebhook(req, res) {
  const body = req.body;
  if (body.object !== 'page') return res.sendStatus(404);

  res.sendStatus(200); // Acknowledge immediately

  for (const entry of body.entry || []) {
    for (const event of entry.messaging || []) {
      handleMessengerEvent(event).catch(err =>
        console.error('[Messenger] Event error:', err.message)
      );
    }
  }
}

module.exports = { verifyWebhook, receiveWebhook };
