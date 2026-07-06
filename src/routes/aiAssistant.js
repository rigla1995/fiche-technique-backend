const express = require('express');
const router = express.Router();
const { authenticate, requireSuperAdmin } = require('../middleware/auth');
const ai = require('../controllers/aiAssistantController');

/**
 * @openapi
 * /api/ai-assistant/config/{clientId}:
 *   get:
 *     tags: [Agent IA]
 *     summary: Récupérer la config IA d'un client (super_admin)
 *     parameters:
 *       - in: path
 *         name: clientId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Configuration IA du client
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 enabled: { type: boolean }
 *                 messengerPageId: { type: string, nullable: true }
 *                 messengerLinked: { type: boolean }
 *                 inviteToken: { type: string, nullable: true }
 *   put:
 *     tags: [Agent IA]
 *     summary: Mettre à jour la config IA d'un client (super_admin)
 *     parameters:
 *       - in: path
 *         name: clientId
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               enabled: { type: boolean }
 *     responses:
 *       200:
 *         description: Config mise à jour
 *
 * /api/ai-assistant/config/{clientId}/messenger-invite:
 *   post:
 *     tags: [Agent IA]
 *     summary: Générer un lien d'invitation Messenger (super_admin)
 *     parameters:
 *       - in: path
 *         name: clientId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Lien Messenger généré
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 messengerUrl: { type: string }
 *
 * /api/ai-assistant/agents:
 *   get:
 *     tags: [Agent IA]
 *     summary: Lister tous les agents IA actifs (super_admin)
 *     responses:
 *       200:
 *         description: Liste des agents
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   clientId: { type: integer }
 *                   clientNom: { type: string }
 *                   enabled: { type: boolean }
 *                   messengerLinked: { type: boolean }
 *
 * /api/ai-assistant/status:
 *   get:
 *     tags: [Agent IA]
 *     summary: Statut de l'agent IA du client connecté
 *     responses:
 *       200:
 *         description: Statut de l'agent
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 enabled: { type: boolean }
 *                 linked: { type: boolean }
 *
 * /api/ai-assistant/conversation:
 *   get:
 *     tags: [Agent IA]
 *     summary: Récupérer l'historique de conversation IA du client
 *     responses:
 *       200:
 *         description: Messages de conversation
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   role: { type: string, enum: [user, assistant] }
 *                   content: { type: string }
 *                   timestamp: { type: string, format: date-time }
 *   delete:
 *     tags: [Agent IA]
 *     summary: Effacer la conversation IA du client
 *     responses:
 *       200:
 *         description: Conversation effacée
 *
 * /api/ai-assistant/chat:
 *   post:
 *     tags: [Agent IA]
 *     summary: Envoyer un message à l'agent IA
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [message]
 *             properties:
 *               message: { type: string, example: Quel est mon stock de farine ? }
 *     responses:
 *       200:
 *         description: Réponse de l'agent IA
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 reply: { type: string }
 *       403:
 *         description: Agent IA non activé pour ce compte
 */
router.get('/config/:clientId', authenticate, requireSuperAdmin, ai.getAiConfig);
router.put('/config/:clientId', authenticate, requireSuperAdmin, ai.setAiConfig);
router.post('/config/:clientId/messenger-invite', authenticate, requireSuperAdmin, ai.generateMessengerInviteLink);
router.get('/agents', authenticate, requireSuperAdmin, ai.getActiveAgents);
router.get('/status', authenticate, ai.getClientStatus);
router.get('/conversation', authenticate, ai.getClientConversation);
router.post('/chat', authenticate, ai.clientChat);
router.delete('/conversation', authenticate, ai.clearClientConversation);

module.exports = router;
