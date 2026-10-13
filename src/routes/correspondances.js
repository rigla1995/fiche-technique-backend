const express = require('express');
const router = express.Router();
const { contexte, lister, modifier, oublier, exporter } = require('../controllers/correspondancesController');
const { authenticate, requireClient } = require('../middleware/auth');

// Étape F3 (factures fournisseur) : ce que LabFlow apprend des factures validées, par fournisseur.
router.get('/contexte', authenticate, requireClient, contexte);
router.get('/export', authenticate, requireClient, exporter);
router.get('/', authenticate, requireClient, lister);
router.patch('/:id', authenticate, requireClient, modifier);
router.delete('/:id', authenticate, requireClient, oublier);

module.exports = router;
