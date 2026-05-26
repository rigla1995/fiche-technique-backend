const express = require('express');
const router = express.Router();
const { getTemplate, importReferentiel, getArticleAssignments } = require('../controllers/referentielController');
const { authenticate, requireClient } = require('../middleware/auth');

router.get('/template', authenticate, requireClient, getTemplate);
router.post('/import', authenticate, requireClient, importReferentiel);
router.get('/articles/:id/assignments', authenticate, requireClient, getArticleAssignments);

module.exports = router;
