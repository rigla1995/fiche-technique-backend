const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { addClient, removeClient } = require('../services/sseService');

// GET /api/notifications/stream — SSE endpoint, auth via JWT
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

  // Keep-alive heartbeat every 25s
  const heartbeat = setInterval(() => {
    try { res.write(': ping\n\n'); } catch { clearInterval(heartbeat); }
  }, 25000);

  req.on('close', () => {
    clearInterval(heartbeat);
    removeClient(userId, role, res);
  });
});

module.exports = router;
