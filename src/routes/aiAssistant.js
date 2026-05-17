const express = require('express');
const router = express.Router();
const { authenticate, requireSuperAdmin } = require('../middleware/auth');
const ai = require('../controllers/aiAssistantController');

// Admin: per-client config
router.get('/config/:clientId', authenticate, requireSuperAdmin, ai.getAiConfig);
router.put('/config/:clientId', authenticate, requireSuperAdmin, ai.setAiConfig);
router.post('/config/:clientId/invite', authenticate, requireSuperAdmin, ai.generateInviteLink);

// Admin: all agents dashboard
router.get('/agents', authenticate, requireSuperAdmin, ai.getActiveAgents);

module.exports = router;
