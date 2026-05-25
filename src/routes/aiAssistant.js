const express = require('express');
const router = express.Router();
const { authenticate, requireSuperAdmin } = require('../middleware/auth');
const ai = require('../controllers/aiAssistantController');

// Admin: per-client config
router.get('/config/:clientId', authenticate, requireSuperAdmin, ai.getAiConfig);
router.put('/config/:clientId', authenticate, requireSuperAdmin, ai.setAiConfig);
router.post('/config/:clientId/invite', authenticate, requireSuperAdmin, ai.generateInviteLink);
router.post('/config/:clientId/messenger-invite', authenticate, requireSuperAdmin, ai.generateMessengerInviteLink);

// Admin: all agents dashboard
router.get('/agents', authenticate, requireSuperAdmin, ai.getActiveAgents);

// Client: web chat interface
router.get('/status', authenticate, ai.getClientStatus);
router.get('/conversation', authenticate, ai.getClientConversation);
router.post('/chat', authenticate, ai.clientChat);
router.delete('/conversation', authenticate, ai.clearClientConversation);

module.exports = router;
