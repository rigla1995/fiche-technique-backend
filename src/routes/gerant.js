const express = require('express');
const router = express.Router();
const { authenticate, requireGerant } = require('../middleware/auth');
const { getDashboard, getAbonnementResume } = require('../controllers/gerantDashboardController');

router.get('/dashboard', authenticate, requireGerant, getDashboard);
router.get('/abonnement', authenticate, requireGerant, getAbonnementResume);

module.exports = router;
