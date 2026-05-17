const crypto = require('crypto');
const pool = require('../config/database');
const { getBotUsername, sendWelcomeMessage } = require('../services/telegramService');

// ── Admin: get AI config for a client ────────────────────────────────────────

const getAiConfig = async (req, res) => {
  try {
    const { clientId } = req.params;
    const result = await pool.query(
      `SELECT client_id, enabled, whatsapp_number, telegram_chat_id,
              invite_token, confidence_threshold
       FROM ai_assistant_config WHERE client_id = $1`,
      [clientId]
    );
    if (result.rows.length === 0) {
      return res.json({ clientId: parseInt(clientId), enabled: false, telegramLinked: false, confidenceThreshold: 0.75 });
    }
    const r = result.rows[0];
    const botUser = getBotUsername();
    const inviteLink = r.invite_token && botUser
      ? `https://t.me/${botUser}?start=${r.invite_token}`
      : null;
    res.json({
      clientId: r.client_id,
      enabled: r.enabled,
      telegramLinked: !!r.telegram_chat_id,
      telegramChatId: r.telegram_chat_id,
      inviteLink,
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

    res.json({ clientId: parseInt(clientId), enabled, telegramLinked: hasChatId, inviteLink, confidenceThreshold: threshold });
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

    res.json({ inviteLink: `https://t.me/${botUser}?start=${inviteToken}` });
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
         aic.confidence_threshold,
         aic.invite_token,
         aic.updated_at,
         u.nom,
         u.email,
         COALESCE(stats.msg_count, 0) AS message_count,
         stats.last_activity
       FROM ai_assistant_config aic
       JOIN utilisateurs u ON u.id = aic.client_id
       LEFT JOIN (
         SELECT
           client_id,
           COUNT(*) AS msg_count,
           MAX(updated_at) AS last_activity
         FROM ai_conversations
         GROUP BY client_id
       ) stats ON stats.client_id = aic.client_id
       ORDER BY aic.enabled DESC, stats.last_activity DESC NULLS LAST`
    );

    const botUser = getBotUsername();
    const agents = result.rows.map(r => ({
      clientId: r.client_id,
      clientNom: r.nom,
      clientEmail: r.email,
      enabled: r.enabled,
      telegramLinked: !!r.telegram_chat_id,
      confidenceThreshold: parseFloat(r.confidence_threshold) || 0.75,
      messageCount: parseInt(r.message_count),
      lastActivity: r.last_activity,
      inviteLink: r.invite_token && botUser && !r.telegram_chat_id
        ? `https://t.me/${botUser}?start=${r.invite_token}`
        : null,
      activatedAt: r.updated_at,
    }));

    res.json(agents);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

module.exports = { getAiConfig, setAiConfig, generateInviteLink, getActiveAgents };
