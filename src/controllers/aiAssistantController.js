const crypto = require('crypto');
const pool = require('../config/database');
const { sendMessengerInviteEmail } = require('../services/emailService');
const { buildClientConfigSnapshot } = require('../services/clientConfigService');

// ── Admin: get AI config for a client ────────────────────────────────────────

const getAiConfig = async (req, res) => {
  try {
    const { clientId } = req.params;
    const result = await pool.query(
      `SELECT client_id, enabled, messenger_psid, messenger_invite_token, report_email, confidence_threshold
       FROM ai_assistant_config WHERE client_id = $1`,
      [clientId]
    );
    if (result.rows.length === 0) {
      return res.json({ clientId: parseInt(clientId), enabled: false, messengerLinked: false, confidenceThreshold: 0.75 });
    }
    const r = result.rows[0];
    const messengerPageUsername = process.env.MESSENGER_PAGE_USERNAME;
    const messengerInviteLink = r.messenger_invite_token && messengerPageUsername
      ? `https://m.me/${messengerPageUsername}?ref=${r.messenger_invite_token}`
      : null;
    res.json({
      clientId: r.client_id,
      enabled: r.enabled,
      messengerLinked: !!r.messenger_psid,
      messengerPsid: r.messenger_psid,
      messengerInviteLink,
      reportEmail: r.report_email || null,
      confidenceThreshold: parseFloat(r.confidence_threshold) || 0.75,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

const setAiConfig = async (req, res) => {
  try {
    const { clientId } = req.params;
    const { enabled, confidenceThreshold } = req.body;

    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ message: 'Le champ enabled est requis (boolean)' });
    }

    const threshold = Math.min(1, Math.max(0, parseFloat(confidenceThreshold) || 0.75));

    const existing = await pool.query(
      'SELECT enabled, messenger_psid, messenger_invite_token FROM ai_assistant_config WHERE client_id = $1',
      [clientId]
    );

    await pool.query(
      `INSERT INTO ai_assistant_config (client_id, enabled, confidence_threshold, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (client_id) DO UPDATE
         SET enabled = $2, confidence_threshold = $3, updated_at = NOW()`,
      [clientId, enabled, threshold]
    );

    // Précharge/rafraîchit le snapshot de config statique de l'agent à l'activation
    if (enabled) {
      buildClientConfigSnapshot(clientId).catch(e => console.warn('[AI] Préchargement config agent échoué:', e.message));
    }

    const messengerPageUsername = process.env.MESSENGER_PAGE_USERNAME;
    const messengerInviteLink = existing.rows[0]?.messenger_invite_token && messengerPageUsername && !existing.rows[0]?.messenger_psid
      ? `https://m.me/${messengerPageUsername}?ref=${existing.rows[0].messenger_invite_token}`
      : null;

    res.json({
      clientId: parseInt(clientId),
      enabled,
      messengerLinked: !!existing.rows[0]?.messenger_psid,
      messengerInviteLink,
      confidenceThreshold: threshold,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// ── Admin: generate fresh Messenger invite link ───────────────────────────────

const generateMessengerInviteLink = async (req, res) => {
  try {
    const { clientId } = req.params;
    const messengerPageUsername = process.env.MESSENGER_PAGE_USERNAME;
    if (!messengerPageUsername) {
      return res.status(503).json({ message: 'MESSENGER_PAGE_USERNAME non configuré' });
    }

    // Email de destination : saisi par l'admin (peut différer de l'email du compte, ex.
    // l'email lié au Messenger personnel du propriétaire) ; à défaut, l'email connu du client.
    const clientRow = await pool.query('SELECT nom, email FROM utilisateurs WHERE id = $1', [clientId]);
    const { nom, email: clientEmail } = clientRow.rows[0] || {};
    const rawEmail = (req.body?.email || '').trim();
    const reportEmail = rawEmail || clientEmail || null;
    if (!reportEmail) {
      return res.status(400).json({ message: 'Aucun email disponible pour envoyer l\'activation. Saisissez un email.' });
    }

    const inviteToken = crypto.randomBytes(24).toString('hex');

    await pool.query(
      `INSERT INTO ai_assistant_config (client_id, enabled, messenger_invite_token, report_email, updated_at)
       VALUES ($1, false, $2, $3, NOW())
       ON CONFLICT (client_id) DO UPDATE
         SET messenger_invite_token = $2, report_email = $3, messenger_psid = NULL, updated_at = NOW()`,
      [clientId, inviteToken, reportEmail]
    );

    const inviteLink = `https://m.me/${messengerPageUsername}?ref=${inviteToken}`;

    sendMessengerInviteEmail({
      to: reportEmail,
      clientNom: nom || 'Client',
      inviteLink,
      appName: process.env.APP_NAME,
    }).catch(e => console.warn('[AI] Messenger invite email error:', e.message));

    res.json({ messengerInviteLink: inviteLink, reportEmail });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// ── Admin: list all active AI agents ─────────────────────────────────────────

const getActiveAgents = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
         aic.client_id,
         aic.enabled,
         aic.messenger_psid,
         aic.messenger_invite_token,
         aic.report_email,
         aic.updated_at,
         u.nom,
         u.email,
         COALESCE(stats.msg_count, 0)      AS message_count,
         stats.last_activity,
         last_conv.last_confidence,
         ROUND(stats.avg_confidence_month::numeric, 2) AS avg_confidence_month,
         COALESCE(tok_month.tokens_total, 0) AS tokens_month,
         COALESCE(tok_month.msg_count, 0)    AS tokens_msg_month,
         COALESCE(tok_all.tokens_total, 0)   AS tokens_total
       FROM ai_assistant_config aic
       JOIN utilisateurs u ON u.id = aic.client_id
       LEFT JOIN (
         SELECT
           client_id,
           COUNT(*)                                                                         AS msg_count,
           MAX(updated_at)                                                                  AS last_activity,
           AVG(CASE WHEN updated_at >= date_trunc('month', NOW()) THEN last_confidence END) AS avg_confidence_month
         FROM ai_conversations
         GROUP BY client_id
       ) stats ON stats.client_id = aic.client_id
       LEFT JOIN LATERAL (
         SELECT last_confidence
         FROM ai_conversations
         WHERE client_id = aic.client_id
         ORDER BY updated_at DESC
         LIMIT 1
       ) last_conv ON true
       LEFT JOIN (
         SELECT client_id,
                SUM(tokens_total) AS tokens_total,
                SUM(msg_count)    AS msg_count
         FROM ai_token_usage
         WHERE usage_date >= date_trunc('month', CURRENT_DATE)
         GROUP BY client_id
       ) tok_month ON tok_month.client_id = aic.client_id
       LEFT JOIN (
         SELECT client_id, SUM(tokens_total) AS tokens_total
         FROM ai_token_usage
         GROUP BY client_id
       ) tok_all ON tok_all.client_id = aic.client_id
       ORDER BY aic.enabled DESC, stats.last_activity DESC NULLS LAST`
    );

    const messengerPageUsername = process.env.MESSENGER_PAGE_USERNAME;
    const agents = result.rows.map(r => ({
      clientId: r.client_id,
      clientNom: r.nom,
      clientEmail: r.email,
      reportEmail: r.report_email || null,
      enabled: r.enabled,
      messengerLinked: !!r.messenger_psid,
      messageCount: parseInt(r.message_count),
      lastActivity: r.last_activity,
      lastConfidence: r.last_confidence != null ? parseFloat(r.last_confidence) : null,
      avgConfidenceMonth: r.avg_confidence_month != null ? parseFloat(r.avg_confidence_month) : null,
      tokensMonth: parseInt(r.tokens_month) || 0,
      tokensTotal: parseInt(r.tokens_total) || 0,
      messengerInviteLink: r.messenger_invite_token && messengerPageUsername && !r.messenger_psid
        ? `https://m.me/${messengerPageUsername}?ref=${r.messenger_invite_token}`
        : null,
      activatedAt: r.updated_at,
    }));

    res.json(agents);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// ── Client: web chat endpoints ────────────────────────────────────────────────

const { chatWithClaude } = require('../services/claudeService');
const { chatWithDeepSeek } = require('../services/deepseekService');

async function _chatWithAI(clientId, sessionId, message, threshold) {
  const provider = (process.env.AI_PROVIDER || '').toLowerCase();
  const useGroq = provider === 'groq' || (provider !== 'claude' && !!process.env.GROQ_API_KEY);
  if (useGroq) return chatWithDeepSeek(clientId, sessionId, message, threshold);
  if (process.env.ANTHROPIC_API_KEY) return chatWithClaude(clientId, sessionId, message, threshold);
  return chatWithDeepSeek(clientId, sessionId, message, threshold);
}

const getClientStatus = async (req, res) => {
  const clientId = req.user.gerant_parent_id || req.user.id;
  try {
    const result = await pool.query(
      'SELECT enabled FROM ai_assistant_config WHERE client_id = $1',
      [clientId]
    );
    res.json({ enabled: result.rows[0]?.enabled ?? false });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

const getClientConversation = async (req, res) => {
  const clientId = req.user.gerant_parent_id || req.user.id;
  const sessionId = `web_${req.user.id}`;
  try {
    const result = await pool.query(
      `SELECT messages FROM ai_conversations
       WHERE client_id = $1 AND whatsapp_number = $2
       ORDER BY updated_at DESC LIMIT 1`,
      [clientId, sessionId]
    );
    res.json({ messages: result.rows[0]?.messages ?? [] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

const clientChat = async (req, res) => {
  const clientId = req.user.gerant_parent_id || req.user.id;
  const sessionId = `web_${req.user.id}`;
  const { message } = req.body;
  if (!message?.trim()) return res.status(400).json({ message: 'Message requis' });

  try {
    const cfg = await pool.query(
      'SELECT enabled, confidence_threshold FROM ai_assistant_config WHERE client_id = $1',
      [clientId]
    );
    if (!cfg.rows[0]?.enabled) {
      return res.status(403).json({ message: 'Agent IA non activé pour ce compte' });
    }
    const threshold = parseFloat(cfg.rows[0].confidence_threshold) || 0.75;
    const { assistantMessage } = await _chatWithAI(clientId, sessionId, message.trim(), threshold);
    res.json({ reply: assistantMessage });
  } catch (err) {
    console.error('[AI chat]', err.message);
    res.status(500).json({ message: 'Erreur lors de la communication avec l\'IA' });
  }
};

const clearClientConversation = async (req, res) => {
  const clientId = req.user.gerant_parent_id || req.user.id;
  const sessionId = `web_${req.user.id}`;
  try {
    await pool.query(
      'DELETE FROM ai_conversations WHERE client_id = $1 AND whatsapp_number = $2',
      [clientId, sessionId]
    );
    res.json({ cleared: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

module.exports = {
  getAiConfig, setAiConfig, generateMessengerInviteLink, getActiveAgents,
  getClientStatus, getClientConversation, clientChat, clearClientConversation,
};
