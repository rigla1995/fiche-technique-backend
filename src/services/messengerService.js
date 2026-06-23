const pool = require('../config/database');
const { chatWithClaude } = require('./claudeService');
const { chatWithDeepSeek } = require('./deepseekService');
const { generateAndSendReport } = require('./reportService');
const { verifyMetaSignature } = require('../utils/webhookSignature');
const { withTransaction } = require('../utils/db');
const logger = require('../utils/logger');

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
  const provider = (process.env.AI_PROVIDER || '').toLowerCase();
  // Par défaut on privilégie Groq (llama-3.3-70b, tool-use fiable) dès qu'une clé Groq existe.
  // AI_PROVIDER=claude force Claude ; AI_PROVIDER=groq force Groq.
  const useGroq = provider === 'groq' || (provider !== 'claude' && !!process.env.GROQ_API_KEY);
  if (useGroq) return chatWithDeepSeek(clientId, sessionId, userMessage, confidenceThreshold);
  if (process.env.ANTHROPIC_API_KEY) return chatWithClaude(clientId, sessionId, userMessage, confidenceThreshold);
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
  // On NE filtre PAS sur enabled ici : ouvrir un lien d'invitation valide doit lier le compte
  // (et activer l'agent), même si le flag enabled n'a pas encore été basculé.
  const { rows } = await pool.query(
    `SELECT aic.client_id, aic.confidence_threshold, u.nom,
            COALESCE(aic.report_email, u.email) AS email
     FROM ai_assistant_config aic
     JOIN utilisateurs u ON u.id = aic.client_id
     WHERE aic.messenger_invite_token = $1`,
    [token]
  );
  return rows[0] || null;
};

const findClientByPsid = async (psid) => {
  const { rows } = await pool.query(
    `SELECT aic.client_id, aic.confidence_threshold, u.nom,
            COALESCE(aic.report_email, u.email) AS email
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

  // m.me/PAGE?ref=TOKEN fires a referral event (not a message)
  const referralRef = event.referral?.ref?.trim() || event.postback?.referral?.ref?.trim();
  const messageText = event.message?.text?.trim();
  const postbackPayload = event.postback?.payload?.trim();

  // Check for invite token first (from referral or raw message/postback)
  const tokenCandidate = referralRef || messageText || postbackPayload;

  // Handle invite token from deep link (m.me/page?ref=TOKEN or postback with token)
  const refMatch = tokenCandidate?.match(/^([a-f0-9]{48})$/i);
  if (refMatch) {
    const inviteToken = refMatch[1];
    const client = await findClientByMessengerToken(inviteToken);
    if (!client) {
      logger.warn('messenger_invite_token_not_found', { tokenPrefix: inviteToken.slice(0, 8) });
      return sendMessage(psid, '❌ Lien expiré ou invalide. Contactez votre administrateur LabFlow.');
    }
    // Ouvrir le lien lie le PSID ET active l'agent (idempotent vis-à-vis du flag enabled).
    // Un PSID est unique (1 compte Messenger ↔ 1 client) : on le détache d'abord de tout autre
    // client pour permettre au propriétaire de déplacer son Messenger d'un client à l'autre
    // (le dernier lien ouvert gagne) — sinon la contrainte unique fait échouer la liaison.
    await withTransaction(async (c) => {
      await c.query(
        `UPDATE ai_assistant_config SET messenger_psid = NULL, updated_at = NOW()
         WHERE messenger_psid = $1 AND client_id <> $2`,
        [psid, client.client_id]
      );
      await c.query(
        `UPDATE ai_assistant_config
         SET messenger_psid = $1, messenger_invite_token = NULL, enabled = true, updated_at = NOW()
         WHERE client_id = $2`,
        [psid, client.client_id]
      );
    });
    // Réchauffe le snapshot de config statique du client (début de session Messenger)
    require('./clientConfigService').buildClientConfigSnapshot(client.client_id)
      .catch((e) => logger.warn('messenger_warmup_failed', { error: e.message }));
    return sendMessage(
      psid,
      `👋 Bonjour ${client.nom} !\n\nJe suis votre agent LabFlow. Consultez toutes vos données, comme dans l'application :\n\n` +
      `🏪 Activités & 🏭 labos\n` +
      `📦 Stock, seuils & 🛒 approvisionnements\n` +
      `🔄 Transferts labo → activités\n` +
      `📉 Pertes & 📊 inventaires\n` +
      `🧾 Ventes, CA & food cost\n` +
      `📚 Référentiel, fournisseurs & produits\n` +
      `💳 Abonnement & configuration de vente\n` +
      `📄 Rapports Excel/PDF par email\n\n` +
      `Exemple : « les transferts du mois actuel » ou « mon food cost de septembre ». Posez votre question !`
    );
  }

  // If this was purely a referral event (no user-typed message), stop here
  const text = messageText || postbackPayload;
  if (!text) return;

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
  // Verify the payload really comes from Meta (HMAC-SHA256 over the raw body with the
  // app secret). Without this, anyone could forge events: link a PSID to a client,
  // inject messages, or trigger report emails. Enforced as soon as MESSENGER_APP_SECRET
  // is set; fail-open with a warning until then so the live agent keeps working.
  const { ok, enforced } = verifyMetaSignature(
    req.rawBody,
    req.headers['x-hub-signature-256'],
    process.env.MESSENGER_APP_SECRET
  );
  if (enforced && !ok) {
    logger.warn('messenger_webhook_rejected', { reason: 'invalid_signature' });
    return res.sendStatus(401);
  }
  if (!enforced) {
    logger.warn('messenger_webhook_unverified', { reason: 'MESSENGER_APP_SECRET not set — webhook is NOT authenticated' });
  }

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
