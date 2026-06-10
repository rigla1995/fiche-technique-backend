const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { addClient, removeClient } = require('../services/sseService');
const { list, clearAll, deleteOne } = require('../controllers/notificationController');

/**
 * @openapi
 * /api/notifications/stream:
 *   get:
 *     tags: [Notifications]
 *     summary: Flux SSE de notifications en temps réel
 *     description: Connexion Server-Sent Events. Envoie un ping toutes les 25s. Authentification via Bearer header ou ?token=
 *     responses:
 *       200:
 *         description: Flux SSE ouvert
 *         content:
 *           text/event-stream:
 *             schema:
 *               type: string
 *       401:
 *         description: Non authentifié
 *
 * /api/notifications:
 *   get:
 *     tags: [Notifications]
 *     summary: Lister les notifications persistées
 *     responses:
 *       200:
 *         description: Liste des notifications
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id: { type: integer }
 *                   type: { type: string }
 *                   message: { type: string }
 *                   lu: { type: boolean }
 *                   created_at: { type: string, format: date-time }
 *   delete:
 *     tags: [Notifications]
 *     summary: Supprimer toutes les notifications
 *     responses:
 *       200:
 *         description: Notifications effacées
 *
 * /api/notifications/{id}:
 *   delete:
 *     tags: [Notifications]
 *     summary: Supprimer une notification
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Notification supprimée
 */
router.get('/stream', authenticate, (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();

  const userId = req.user.id;
  const role = req.user.role;

  addClient(userId, role, res);

  const heartbeat = setInterval(() => {
    try { res.write(': ping\n\n'); } catch { clearInterval(heartbeat); }
  }, 25000);

  req.on('close', () => {
    clearInterval(heartbeat);
    removeClient(userId, role, res);
  });
});

router.get('/', authenticate, list);
router.delete('/', authenticate, clearAll);
router.delete('/:id', authenticate, deleteOne);

module.exports = router;
