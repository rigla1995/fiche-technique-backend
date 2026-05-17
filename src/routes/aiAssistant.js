const express = require('express');
const router = express.Router();
const { authenticate, requireSuperAdmin } = require('../middleware/auth');
const ai = require('../controllers/aiAssistantController');

// Admin: get/set AI + WhatsApp config per client
router.get('/config/:clientId', authenticate, requireSuperAdmin, ai.getAiConfig);
router.put('/config/:clientId', authenticate, requireSuperAdmin, ai.setAiConfig);

// Admin: WhatsApp bot status + QR code for pairing
router.get('/whatsapp-status', authenticate, requireSuperAdmin, ai.getWhatsAppStatus);

module.exports = router;
