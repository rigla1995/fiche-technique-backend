const express = require('express');
const router = express.Router();
const { authenticate, requireClient } = require('../middleware/auth');
const r = require('../controllers/rapportsController');

router.get('/filters',       authenticate, requireClient, r.getRapportFilters);
router.get('/pertes',        authenticate, requireClient, r.getRapportPertes);
router.get('/cout-matiere',  authenticate, requireClient, r.getRapportCoutMatiere);
router.get('/appros',        authenticate, requireClient, r.getRapportAppros);
router.get('/stock',         authenticate, requireClient, r.getRapportStock);
router.get('/activites',     authenticate, requireClient, r.getRapportActivites);

module.exports = router;
