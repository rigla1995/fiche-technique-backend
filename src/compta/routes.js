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
const gerants = require('./gerantsCabinet');
const dossiers = require('./dossiers');

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
// Limite de débit (relecture de S3b) : chaque désignation peut créer un compte et envoyer un email ; 30 écritures par
// quart d'heure et par personne suffisent largement à gérer ses comptables.
const limiteComptables = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  keyGenerator: (req) => `comptables:${req.user.id}`,
  message: { message: 'Trop de modifications en peu de temps, réessayez dans un quart d\'heure.' },
  standardHeaders: true,
  legacyHeaders: false,
});
// S3c (relecture) : retirer ou désactiver un accès — toujours permis, sans compte ni email créé — a son propre compteur,
// plus large : couper l'accès de plusieurs personnes ne doit pas attendre un quart d'heure.
const limiteRetraits = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 150,
  keyGenerator: (req) => `retraits:${req.user.id}`,
  message: { message: 'Trop de modifications en peu de temps, réessayez dans un quart d\'heure.' },
  standardHeaders: true,
  legacyHeaders: false,
});
router.get('/mes-comptables', authenticate, comptables.lister);
router.post('/mes-comptables', authenticate, limiteComptables, comptables.ajouter);
router.put('/mes-comptables/:id', authenticate, limiteComptables, comptables.modifier);
router.delete('/mes-comptables/:id', authenticate, limiteRetraits, comptables.retirer);
router.post('/mes-comptables/:id/inviter', authenticate, limiteComptables, comptables.inviter);
// La personne à qui une comptabilité est confiée : sa page, et quitter l'accès (jamais refusé par la garde).
router.get('/confiees/:espaceId', authenticate, comptables.confiee);
router.post('/confiees/:espaceId/quitter', authenticate, comptables.quitter);

// Étape S3c : les gérants du cabinet. Le titulaire (vérifié sur compta.acces) gère les accès de ses collaborateurs et
// demande des gérants à l'équipe LabFlow ; chaque écriture passe par la garde PAR COMPTABILITÉ dans le contrôleur.
router.get('/cabinet/gerants', authenticate, exigerTitulaireCabinet, gerants.lister);
router.post('/cabinet/gerants', authenticate, exigerTitulaireCabinet, limiteComptables, gerants.ajouter);
router.put('/cabinet/gerants/:id', authenticate, exigerTitulaireCabinet, limiteComptables, gerants.modifier);
router.delete('/cabinet/gerants/:id', authenticate, exigerTitulaireCabinet, limiteRetraits, gerants.retirer);
router.post('/cabinet/gerants/:id/desactiver', authenticate, exigerTitulaireCabinet, limiteRetraits, gerants.desactiver);
router.post('/cabinet/gerants/:id/reactiver', authenticate, exigerTitulaireCabinet, limiteComptables, gerants.reactiver);
router.post('/cabinet/gerants/:id/inviter', authenticate, exigerTitulaireCabinet, limiteComptables, gerants.inviter);
router.post('/cabinet/demande-gerants', authenticate, exigerTitulaireCabinet, limiteComptables, gerants.demander);
// Le collaborateur : la page du cabinet (le titulaire gère son équipe : pas de « Quitter », réponse du client du 07/10).
router.get('/cabinets/:espaceId', authenticate, gerants.membre);

// Étape S4a : les dossiers d'une comptabilité (D3 : la comptabilité voyage dans l'adresse ; l'accès de la personne —
// titulaire ou gérant, tous les dossiers ou sa liste — et son niveau sont jugés par le contrôleur sur compta.acces,
// jamais le rôle seul). Limite de débit : un cabinet qui reprend sa clientèle ouvre beaucoup de dossiers à la suite —
// 100 écritures par quart d'heure et par personne (aucun compte ni email créé).
const limiteDossiers = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  keyGenerator: (req) => `dossiers:${req.user.id}`,
  message: { message: 'Trop de modifications en peu de temps, réessayez dans un quart d\'heure.' },
  standardHeaders: true,
  legacyHeaders: false,
});
router.get('/espaces/:espaceId/dossiers', authenticate, dossiers.lister);
router.post('/espaces/:espaceId/dossiers', authenticate, limiteDossiers, dossiers.creer);
router.get('/dossiers/:dossierId', authenticate, dossiers.fiche);
router.put('/dossiers/:dossierId', authenticate, limiteDossiers, dossiers.modifier);
router.post('/dossiers/:dossierId/archiver', authenticate, limiteDossiers, dossiers.archiver);
router.post('/dossiers/:dossierId/desarchiver', authenticate, limiteDossiers, dossiers.desarchiver);
router.delete('/dossiers/:dossierId', authenticate, limiteDossiers, dossiers.supprimer);

// Routes d'écriture SANS garde par comptabilité (test/comptaS3b.test.js) : elles n'écrivent dans aucune comptabilité.
// Toute autre écriture de ce routeur appelle exigerEcriture (garde.js) : la garde globale de src/app.js ne s'applique
// plus à /api/compta (D4).
const ECRITURES_SANS_GARDE = ['POST /passage', 'POST /confiees/:espaceId/quitter'];
// Écritures permises quel que soit l'abonnement (réponse du client du 07/10, S3c ; test/comptaS3c.test.js) : retirer ou
// désactiver un accès — couper l'accès d'une personne qui part est une mesure de sécurité. Elles passent par la
// transaction verrouillée de leur contrôleur, avec `{ garde: false }`.
const ECRITURES_TOUJOURS_PERMISES = ['DELETE /mes-comptables/:id', 'DELETE /cabinet/gerants/:id', 'POST /cabinet/gerants/:id/desactiver'];

module.exports = router;
module.exports.ECRITURES_SANS_GARDE = ECRITURES_SANS_GARDE;
module.exports.ECRITURES_TOUJOURS_PERMISES = ECRITURES_TOUJOURS_PERMISES;
