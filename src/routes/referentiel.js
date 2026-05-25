const express = require('express');
const router = express.Router();
const { getTemplate, importReferentiel } = require('../controllers/referentielController');
const { authenticate, requireClient } = require('../middleware/auth');

router.get('/template', authenticate, requireClient, getTemplate);
router.post('/import', authenticate, requireClient, importReferentiel);

module.exports = router;
