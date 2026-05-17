const pool = require('../config/database');
const { getStatus } = require('../services/whatsappService');

// ── Admin: get AI + WhatsApp config for a client ─────────────────────────────

const getAiConfig = async (req, res) => {
  try {
    const { clientId } = req.params;
    const result = await pool.query(
      'SELECT client_id, enabled, whatsapp_number FROM ai_assistant_config WHERE client_id = $1',
      [clientId]
    );
    if (result.rows.length === 0) {
      return res.json({ clientId: parseInt(clientId), enabled: false, whatsappNumber: null });
    }
    const row = result.rows[0];
    res.json({ clientId: row.client_id, enabled: row.enabled, whatsappNumber: row.whatsapp_number });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

const setAiConfig = async (req, res) => {
  try {
    const { clientId } = req.params;
    const { enabled, whatsappNumber } = req.body;

    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ message: 'Le champ enabled est requis (boolean)' });
    }
    if (enabled && !whatsappNumber) {
      return res.status(400).json({ message: 'Le numéro WhatsApp est requis pour activer l\'assistant IA' });
    }

    const normalizedNumber = whatsappNumber ? whatsappNumber.trim() : null;

    await pool.query(
      `INSERT INTO ai_assistant_config (client_id, enabled, whatsapp_number, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (client_id) DO UPDATE SET enabled = $2, whatsapp_number = $3, updated_at = NOW()`,
      [clientId, enabled, normalizedNumber]
    );
    res.json({ clientId: parseInt(clientId), enabled, whatsappNumber: normalizedNumber });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// ── Admin: WhatsApp bot status + QR code ─────────────────────────────────────

const getWhatsAppStatus = async (req, res) => {
  try {
    const status = await getStatus();
    res.json(status);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

module.exports = { getAiConfig, setAiConfig, getWhatsAppStatus };
