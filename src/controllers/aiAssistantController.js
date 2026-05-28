const crypto = require('crypto');
const pool = require('../config/database');
const { getBotUsername, sendWelcomeMessage } = require('../services/telegramService');
const { sendAiAgentInviteEmail, sendMessengerInviteEmail } = require('../services/emailService');

// ── Admin: get AI config for a client ────────────────────────────────────────

const getAiConfig = async (req, res) => {
  try {
    const { clientId } = req.params;
    const result = await pool.query(
      `SELECT client_id, enabled, whatsapp_number, telegram_chat_id,
              invite_token, messenger_psid, messenger_invite_token, confidence_threshold
       FROM ai_assistant_config WHERE client_id = $1`,
      [clientId]
    );
    if (result.rows.length === 0) {
      return res.json({ clientId: parseInt(clientId), enabled: false, telegramLinked: false, messengerLinked: false, confidenceThreshold: 0.75 });
    }
    const r = result.rows[0];
    const botUser = getBotUsername();
    const telegramInviteLink = r.invite_token && botUser
      ? `https://t.me/${botUser}?start=${r.invite_token}`
      : null;
    const messengerPageUsername = process.env.MESSENGER_PAGE_USERNAME;
    const messengerInviteLink = r.messenger_invite_token && messengerPageUsername
      ? `https://m.me/${messengerPageUsername}?ref=${r.messenger_invite_token}`
      : null;
    res.json({
      clientId: r.client_id,
      enabled: r.enabled,
      telegramLinked: !!r.telegram_chat_id,
      telegramChatId: r.telegram_chat_id,
      inviteLink: telegramInviteLink,
      messengerLinked: !!r.messenger_psid,
      messengerPsid: r.messenger_psid,
      messengerInviteLink,
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

    // Check existing state
    const existing = await pool.query(
      'SELECT enabled, telegram_chat_id, invite_token FROM ai_assistant_config WHERE client_id = $1',
      [clientId]
    );
    const wasDisabled = !existing.rows[0]?.enabled;
    const hasChatId = !!existing.rows[0]?.telegram_chat_id;

    // Generate new invite token if enabling and not yet linked
    let inviteToken = existing.rows[0]?.invite_token || null;
    if (enabled && !hasChatId) {
      inviteToken = crypto.randomBytes(24).toString('hex');
    }

    await pool.query(
      `INSERT INTO ai_assistant_config (client_id, enabled, confidence_threshold, invite_token, updated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (client_id) DO UPDATE
         SET enabled = $2, confidence_threshold = $3,
             invite_token = COALESCE(EXCLUDED.invite_token, ai_assistant_config.invite_token),
             updated_at = NOW()`,
      [clientId, enabled, threshold, inviteToken]
    );

    // If re-activating and already linked, send welcome message
    if (enabled && wasDisabled && hasChatId) {
      const chatId = existing.rows[0].telegram_chat_id;
      const clientRow = await pool.query('SELECT nom FROM utilisateurs WHERE id = $1', [clientId]);
      const nom = clientRow.rows[0]?.nom || 'Client';
      try {
        await sendWelcomeMessage(chatId, nom);
      } catch (e) {
        console.warn('[AI] Welcome message error:', e.message);
      }
    }

    const botUser = getBotUsername();
    const inviteLink = inviteToken && botUser && !hasChatId
      ? `https://t.me/${botUser}?start=${inviteToken}`
      : null;

    const messengerPageUsername = process.env.MESSENGER_PAGE_USERNAME;
    const messengerInviteLink = existing.rows[0]?.messenger_invite_token && messengerPageUsername && !existing.rows[0]?.messenger_psid
      ? `https://m.me/${messengerPageUsername}?ref=${existing.rows[0].messenger_invite_token}`
      : null;

    // Send invitation email when activating a new (non-linked) agent
    if (enabled && wasDisabled && !hasChatId && inviteLink) {
      const clientRow = await pool.query('SELECT nom, email FROM utilisateurs WHERE id = $1', [clientId]);
      const { nom, email } = clientRow.rows[0] || {};
      if (email) {
        sendAiAgentInviteEmail({
          to: email,
          clientNom: nom || 'Client',
          inviteLink,
          appName: process.env.APP_NAME,
        }).catch(e => console.warn('[AI] Invite email error:', e.message));
      }
    }

    res.json({
      clientId: parseInt(clientId),
      enabled,
      telegramLinked: hasChatId,
      inviteLink,
      messengerLinked: !!existing.rows[0]?.messenger_psid,
      messengerInviteLink,
      confidenceThreshold: threshold,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// ── Admin: generate fresh invite link ────────────────────────────────────────

const generateInviteLink = async (req, res) => {
  try {
    const { clientId } = req.params;
    const inviteToken = crypto.randomBytes(24).toString('hex');

    await pool.query(
      `INSERT INTO ai_assistant_config (client_id, enabled, invite_token, updated_at)
       VALUES ($1, false, $2, NOW())
       ON CONFLICT (client_id) DO UPDATE SET invite_token = $2, telegram_chat_id = NULL, updated_at = NOW()`,
      [clientId, inviteToken]
    );

    const botUser = getBotUsername();
    if (!botUser) return res.status(503).json({ message: 'Bot Telegram non connecté — vérifiez TELEGRAM_BOT_TOKEN' });

    const inviteLink = `https://t.me/${botUser}?start=${inviteToken}`;

    // Send new invite link by email
    const clientRow = await pool.query('SELECT nom, email FROM utilisateurs WHERE id = $1', [clientId]);
    const { nom, email } = clientRow.rows[0] || {};
    if (email) {
      sendAiAgentInviteEmail({
        to: email,
        clientNom: nom || 'Client',
        inviteLink,
        appName: process.env.APP_NAME,
      }).catch(e => console.warn('[AI] Invite email error:', e.message));
    }

    res.json({ inviteLink });
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

    const inviteToken = crypto.randomBytes(24).toString('hex');

    await pool.query(
      `INSERT INTO ai_assistant_config (client_id, enabled, messenger_invite_token, updated_at)
       VALUES ($1, false, $2, NOW())
       ON CONFLICT (client_id) DO UPDATE
         SET messenger_invite_token = $2, messenger_psid = NULL, updated_at = NOW()`,
      [clientId, inviteToken]
    );

    const inviteLink = `https://m.me/${messengerPageUsername}?ref=${inviteToken}`;

    const clientRow = await pool.query('SELECT nom, email FROM utilisateurs WHERE id = $1', [clientId]);
    const { nom, email } = clientRow.rows[0] || {};
    if (email) {
      sendMessengerInviteEmail({
        to: email,
        clientNom: nom || 'Client',
        inviteLink,
        appName: process.env.APP_NAME,
      }).catch(e => console.warn('[AI] Messenger invite email error:', e.message));
    }

    res.json({ messengerInviteLink: inviteLink });
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
         aic.telegram_chat_id,
         aic.invite_token,
         aic.updated_at,
         u.nom,
         u.email,
         COALESCE(stats.msg_count, 0)      AS message_count,
         stats.last_activity,
         last_conv.last_confidence,
         ROUND(stats.avg_confidence_month::numeric, 2) AS avg_confidence_month
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
       ORDER BY aic.enabled DESC, stats.last_activity DESC NULLS LAST`
    );

    const botUser = getBotUsername();
    const messengerPageUsername = process.env.MESSENGER_PAGE_USERNAME;
    const agents = result.rows.map(r => ({
      clientId: r.client_id,
      clientNom: r.nom,
      clientEmail: r.email,
      enabled: r.enabled,
      telegramLinked: !!r.telegram_chat_id,
      messengerLinked: !!r.messenger_psid,
      messageCount: parseInt(r.message_count),
      lastActivity: r.last_activity,
      lastConfidence: r.last_confidence != null ? parseFloat(r.last_confidence) : null,
      avgConfidenceMonth: r.avg_confidence_month != null ? parseFloat(r.avg_confidence_month) : null,
      inviteLink: r.invite_token && botUser && !r.telegram_chat_id
        ? `https://t.me/${botUser}?start=${r.invite_token}`
        : null,
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
  if (process.env.ANTHROPIC_API_KEY) {
    return chatWithClaude(clientId, sessionId, message, threshold);
  }
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
  getAiConfig, setAiConfig, generateInviteLink, generateMessengerInviteLink, getActiveAgents,
  getClientStatus, getClientConversation, clientChat, clearClientConversation,
};
