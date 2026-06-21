const express = require('express');
const router = express.Router();
const { getClientDashboard } = require('../controllers/dashboardController');
const { authenticate, requireClient } = require('../middleware/auth');

// GET /api/dashboard/client?from=YYYY-MM-DD&to=YYYY-MM-DD&activiteId=
router.get('/client', authenticate, requireClient, getClientDashboard);

module.exports = router;
