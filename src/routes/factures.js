const express = require('express');
const router = express.Router();
const { list, getLignes, downloadPdf } = require('../controllers/facturesController');
const { authenticate, requireClient } = require('../middleware/auth');

router.get('/', authenticate, requireClient, list);
router.get('/:id/lignes', authenticate, requireClient, getLignes);
router.get('/:id/pdf', authenticate, requireClient, downloadPdf);

module.exports = router;
