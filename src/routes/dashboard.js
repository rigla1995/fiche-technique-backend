const express = require('express');
const router = express.Router();
const { getClientDashboard, getLaboDashboard } = require('../controllers/dashboardController');
const { authenticate, requireClient } = require('../middleware/auth');

// GET /api/dashboard/client?from=YYYY-MM-DD&to=YYYY-MM-DD&activiteId=
router.get('/client', authenticate, requireClient, getClientDashboard);
// GET /api/dashboard/labo?laboId=&from=&to=
router.get('/labo', authenticate, requireClient, getLaboDashboard);

module.exports = router;
