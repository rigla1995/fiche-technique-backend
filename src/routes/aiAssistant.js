const express = require('express');
const router = express.Router();
const { authenticate, requireSuperAdmin, requireClientOrGerant } = require('../middleware/auth');
const ai = require('../controllers/aiAssistantController');

// Admin: get/set AI config per client
router.get('/config/:clientId', authenticate, requireSuperAdmin, ai.getAiConfig);
router.put('/config/:clientId', authenticate, requireSuperAdmin, ai.setAiConfig);

// Client: check status, chat, conversation management
router.get('/status', authenticate, requireClientOrGerant, ai.getMyAiStatus);
router.get('/conversation', authenticate, requireClientOrGerant, ai.getConversation);
router.delete('/conversation', authenticate, requireClientOrGerant, ai.clearConversation);
router.post('/chat', authenticate, requireClientOrGerant, ai.sendMessage);

module.exports = router;
