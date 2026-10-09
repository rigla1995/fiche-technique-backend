const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const { list, getLignes, downloadPdf } = require('../controllers/facturesController');
const pieces = require('../controllers/piecesController');
const { televersement } = require('../services/piecesFacture');
const { authenticate, requireClient } = require('../middleware/auth');

// Étape F1 (factures fournisseur) : un dépôt reçoit jusqu'à 5 fichiers de 15 Mo — 60 envois par quart d'heure et par
// personne ; la lecture des fichiers, 600.
const limiteDepots = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  keyGenerator: (req) => `pieces-depots:${req.user.id}`,
  message: { message: 'Trop d\'envois de pièces en peu de temps, réessayez dans un quart d\'heure.' },
  standardHeaders: true,
  legacyHeaders: false,
});
const limiteLectures = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 600,
  keyGenerator: (req) => `pieces-lectures:${req.user.id}`,
  message: { message: 'Trop d\'ouvertures de pièces en peu de temps, réessayez dans un quart d\'heure.' },
  standardHeaders: true,
  legacyHeaders: false,
});

router.get('/', authenticate, requireClient, list);
router.get('/:id/lignes', authenticate, requireClient, getLignes);
router.get('/:id/pdf', authenticate, requireClient, downloadPdf);
router.get('/:id/pieces', authenticate, requireClient, pieces.lister);
router.get('/:id/pieces/:pieceId/fichier', authenticate, requireClient, limiteLectures, pieces.fichier);
router.post('/:id/pieces', authenticate, requireClient, limiteDepots, pieces.controleAvantEnvoi, televersement, pieces.joindre);
router.put('/:id/pieces/:pieceId', authenticate, requireClient, limiteDepots, pieces.controleAvantEnvoi, televersement, pieces.remplacer);
router.delete('/:id/pieces/:pieceId', authenticate, requireClient, limiteDepots, pieces.supprimer);

module.exports = router;
