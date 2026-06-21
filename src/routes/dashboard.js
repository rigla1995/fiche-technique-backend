const express = require('express');
const router = express.Router();
const { getClientDashboard, getLaboDashboard, getRapportVentes } = require('../controllers/dashboardController');
const { authenticate, requireClient } = require('../middleware/auth');

// GET /api/dashboard/client?from=YYYY-MM-DD&to=YYYY-MM-DD&activiteId=
router.get('/client', authenticate, requireClient, getClientDashboard);
// GET /api/dashboard/labo?laboId=&from=&to=
router.get('/labo', authenticate, requireClient, getLaboDashboard);
// GET /api/dashboard/rapport-ventes?from=&to=&activiteId=&canal=
router.get('/rapport-ventes', authenticate, requireClient, getRapportVentes);

module.exports = router;
