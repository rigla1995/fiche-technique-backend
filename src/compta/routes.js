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
const comptables = require('./comptablesClient');

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

// Étape S3b : le comptable du client. Le titulaire (client LabFlow qui a le module) gère les accès comptables de sa
// comptabilité ; chaque écriture passe par la garde PAR COMPTABILITÉ (garde.js, D4) dans le contrôleur.
router.get('/mes-comptables', authenticate, comptables.lister);
router.post('/mes-comptables', authenticate, comptables.ajouter);
router.put('/mes-comptables/:id', authenticate, comptables.modifier);
router.delete('/mes-comptables/:id', authenticate, comptables.retirer);
router.post('/mes-comptables/:id/inviter', authenticate, comptables.inviter);
// La personne à qui une comptabilité est confiée : sa page, et quitter l'accès (jamais refusé par la garde).
router.get('/confiees/:espaceId', authenticate, comptables.confiee);
router.post('/confiees/:espaceId/quitter', authenticate, comptables.quitter);

// Routes d'écriture SANS garde par comptabilité (test/comptaS3b.test.js) : elles n'écrivent dans aucune comptabilité.
// Toute autre écriture de ce routeur appelle exigerEcriture (garde.js) : la garde globale de src/app.js ne s'applique
// plus à /api/compta (D4).
const ECRITURES_SANS_GARDE = ['POST /passage', 'POST /confiees/:espaceId/quitter'];

module.exports = router;
module.exports.ECRITURES_SANS_GARDE = ECRITURES_SANS_GARDE;
