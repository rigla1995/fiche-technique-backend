const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { addClient, removeClient } = require('../services/sseService');
const { list, clearAll, deleteOne } = require('../controllers/notificationController');

// GET /api/notifications/stream — SSE endpoint, auth via Bearer or ?token=
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

// GET /api/notifications — list persisted notifications
router.get('/', authenticate, list);

// DELETE /api/notifications — clear all (support page opened)
router.delete('/', authenticate, clearAll);

// DELETE /api/notifications/:id — dismiss one
router.delete('/:id', authenticate, deleteOne);

module.exports = router;
