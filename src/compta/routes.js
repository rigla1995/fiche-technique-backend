// LabFlow Compta — routes du serveur, montées sous /api/compta (chantier Achats & Comptabilité,
// labflow-reprise/achats-compta/SPEC-SOCLE.md). Règles (SPEC-SOCLE §0, D3, D4) : jamais le motif
// « gerant_parent_id || id » ni les gardes clientes (requireClient, requireEntreprise) ; à partir de S2, chaque route
// qui touche une comptabilité vérifie l'accès de la personne à cette comptabilité.
const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { listerAcces, maComptabilite, exigerTitulaireCabinet, monCabinet, monAbonnement, telechargerFacture } = require('./accesController');
const rateLimit = require('express-rate-limit');
const { emettre: emettrePassage } = require('./passage');

// Émission des codes de passage : 20 par minute et par personne (au-delà, ce n'est plus une navigation).
const limiteEmission = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  keyGenerator: (req) => `passage:${req.user.id}`,
  message: { message: 'Trop de passages en peu de temps, réessayez dans une minute.' },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * @openapi
 * /api/compta/acces:
 *   get:
 *     tags: [Compta]
 *     summary: Comptabilités accessibles à la personne connectée, en trois groupes
 *     responses:
 *       200:
 *         description: "{ cabinets: [], maComptabilite: [], confiees: [] }"
 */
router.get('/acces', authenticate, listerAcces);

// Étape S2b : les pages du cabinet, pour son titulaire (rôle « comptable »).
router.get('/cabinet', authenticate, exigerTitulaireCabinet, monCabinet);
router.get('/abonnement', authenticate, exigerTitulaireCabinet, monAbonnement);
router.get('/abonnement/paiements/:id/facture', authenticate, exigerTitulaireCabinet, telechargerFacture);

// Étape S2c : la comptabilité d'un client LabFlow qui a le module, pour son titulaire (vérifié sur compta.acces).
router.get('/ma-comptabilite', authenticate, maComptabilite);

// Étape S3a : code de passage vers l'autre adresse (app. ↔ compta.), échangé ensuite par POST /auth/passage.
router.post('/passage', authenticate, limiteEmission, emettrePassage);

module.exports = router;
