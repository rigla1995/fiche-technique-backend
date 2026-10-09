const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const { creer } = require('../controllers/approFactureController');
const { televersement } = require('../services/piecesFacture');
const { authenticate, requireEntreprise } = require('../middleware/auth');

// Étape F1 (factures fournisseur) : une facture d'approvisionnement enregistrée d'un seul coup, avec ses pièces.
// 120 enregistrements par quart d'heure et par personne (une saisie ordinaire en fait quelques-uns).
const limiteFactures = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  keyGenerator: (req) => `appros-factures:${req.user.id}`,
  message: { message: 'Trop d\'enregistrements en peu de temps, réessayez dans un quart d\'heure.' },
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/facture', authenticate, requireEntreprise, limiteFactures, televersement, creer);

module.exports = router;
