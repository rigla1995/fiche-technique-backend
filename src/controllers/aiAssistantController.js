const pool = require('../config/database');
const { chat } = require('../services/claudeService');

// ── Admin: toggle AI per client ──────────────────────────────────────────────

const getAiConfig = async (req, res) => {
  try {
    const { clientId } = req.params;
    const result = await pool.query(
      'SELECT * FROM ai_assistant_config WHERE client_id = $1',
      [clientId]
    );
    if (result.rows.length === 0) {
      return res.json({ clientId: parseInt(clientId), enabled: false });
    }
    const row = result.rows[0];
    res.json({ clientId: row.client_id, enabled: row.enabled });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

const setAiConfig = async (req, res) => {
  try {
    const { clientId } = req.params;
    const { enabled } = req.body;
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ message: 'Le champ enabled est requis (boolean)' });
    }
    await pool.query(
      `INSERT INTO ai_assistant_config (client_id, enabled, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (client_id) DO UPDATE SET enabled = $2, updated_at = NOW()`,
      [clientId, enabled]
    );
    res.json({ clientId: parseInt(clientId), enabled });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// ── Client: check if AI is enabled ──────────────────────────────────────────

const getMyAiStatus = async (req, res) => {
  try {
    const clientId = req.user.gerant_parent_id || req.user.id;
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

// ── Client: get conversation ─────────────────────────────────────────────────

const getConversation = async (req, res) => {
  try {
    const clientId = req.user.gerant_parent_id || req.user.id;
    const userId = req.user.id;

    const result = await pool.query(
      `SELECT messages FROM ai_conversations
       WHERE client_id = $1 AND user_id = $2
       ORDER BY updated_at DESC LIMIT 1`,
      [clientId, userId]
    );
    res.json({ messages: result.rows[0]?.messages ?? [] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

const clearConversation = async (req, res) => {
  try {
    const clientId = req.user.gerant_parent_id || req.user.id;
    const userId = req.user.id;
    await pool.query(
      'DELETE FROM ai_conversations WHERE client_id = $1 AND user_id = $2',
      [clientId, userId]
    );
    res.json({ message: 'Conversation effacée' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// ── Client: send message ─────────────────────────────────────────────────────

const sendMessage = async (req, res) => {
  try {
    const clientId = req.user.gerant_parent_id || req.user.id;
    const userId = req.user.id;
    const { message } = req.body;

    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ message: 'Le message est requis' });
    }

    // Check AI is enabled for this client
    const configResult = await pool.query(
      'SELECT enabled FROM ai_assistant_config WHERE client_id = $1',
      [clientId]
    );
    if (!configResult.rows[0]?.enabled) {
      return res.status(403).json({ message: 'L\'assistant IA n\'est pas activé pour votre compte' });
    }

    // Load existing conversation
    const convResult = await pool.query(
      `SELECT id, messages FROM ai_conversations
       WHERE client_id = $1 AND user_id = $2
       ORDER BY updated_at DESC LIMIT 1`,
      [clientId, userId]
    );
    const conversationId = convResult.rows[0]?.id ?? null;
    const existingMessages = convResult.rows[0]?.messages ?? [];

    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(503).json({ message: 'Clé API Anthropic non configurée' });
    }

    const { assistantMessage, updatedMessages } = await chat(clientId, existingMessages, message.trim());

    // Upsert conversation
    if (conversationId) {
      await pool.query(
        'UPDATE ai_conversations SET messages = $1, updated_at = NOW() WHERE id = $2',
        [JSON.stringify(updatedMessages), conversationId]
      );
    } else {
      await pool.query(
        'INSERT INTO ai_conversations (client_id, user_id, messages) VALUES ($1, $2, $3)',
        [clientId, userId, JSON.stringify(updatedMessages)]
      );
    }

    res.json({ reply: assistantMessage });
  } catch (err) {
    console.error('[AI chat error]', err);
    if (err.status === 401) {
      return res.status(503).json({ message: 'Clé API Anthropic invalide' });
    }
    res.status(500).json({ message: 'Erreur lors de la communication avec l\'IA' });
  }
};

module.exports = { getAiConfig, setAiConfig, getMyAiStatus, getConversation, clearConversation, sendMessage };
