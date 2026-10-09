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
const plan = require('./planComptes');
const journaux = require('./journaux');
const taxes = require('./taxes');
const tiers = require('./tiers');
const ecritures = require('./ecritures');
const validation = require('./validation');
const periodes = require('./periodes');
const livres = require('./livres');
const importEcritures = require('./importEcritures');
const lettrage = require('./lettrage');
const echeancier = require('./echeancier');
const { televersement } = require('./importExcel');

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
// S4b : le dossier « Mon entreprise » d'un client LabFlow reprend l'identité LabFlow du client à la demande.
router.post('/dossiers/:dossierId/reprendre-identite', authenticate, limiteDossiers, dossiers.reprendreIdentite);
router.post('/dossiers/:dossierId/archiver', authenticate, limiteDossiers, dossiers.archiver);
router.post('/dossiers/:dossierId/desarchiver', authenticate, limiteDossiers, dossiers.desarchiver);
router.delete('/dossiers/:dossierId', authenticate, limiteDossiers, dossiers.supprimer);

// Étape S5a : le plan de comptes d'un dossier (lecture : tout accès au dossier ; écritures : Complet ou titulaire, jugé
// par le contrôleur sur compta.acces). Limite de débit : adapter un plan, c'est des dizaines de subdivisions à la
// suite — 300 écritures par quart d'heure et par personne (aucun compte ni email créé).
const limitePlan = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  keyGenerator: (req) => `plan:${req.user.id}`,
  message: { message: 'Trop de modifications en peu de temps, réessayez dans un quart d\'heure.' },
  standardHeaders: true,
  legacyHeaders: false,
});
router.get('/dossiers/:dossierId/plan', authenticate, plan.lire);
router.get('/dossiers/:dossierId/plan/export', authenticate, plan.exporter);
router.post('/dossiers/:dossierId/plan/comptes', authenticate, limitePlan, plan.ajouter);
router.put('/dossiers/:dossierId/plan/comptes/:compteId', authenticate, limitePlan, plan.modifier);
router.post('/dossiers/:dossierId/plan/comptes/:compteId/desactiver', authenticate, limitePlan, plan.desactiver);
router.post('/dossiers/:dossierId/plan/comptes/:compteId/reactiver', authenticate, limitePlan, plan.reactiver);
router.delete('/dossiers/:dossierId/plan/comptes/:compteId', authenticate, limitePlan, plan.supprimer);

// Étape S5b : les journaux et les codes de taxe d'un dossier (lecture : tout accès au dossier ; écritures : Complet ou
// titulaire, jugé par le contrôleur). Même limite de débit que le plan (la configuration d'un dossier se fait d'une
// traite). Un journal ou un code ne se supprime pas : il se désactive.
router.get('/dossiers/:dossierId/journaux', authenticate, journaux.lire);
router.post('/dossiers/:dossierId/journaux', authenticate, limitePlan, journaux.creer);
router.put('/dossiers/:dossierId/journaux/:journalId', authenticate, limitePlan, journaux.modifier);
router.post('/dossiers/:dossierId/journaux/:journalId/desactiver', authenticate, limitePlan, journaux.desactiver);
router.post('/dossiers/:dossierId/journaux/:journalId/reactiver', authenticate, limitePlan, journaux.reactiver);
router.get('/dossiers/:dossierId/taxes', authenticate, taxes.lire);
router.post('/dossiers/:dossierId/taxes', authenticate, limitePlan, taxes.ajouter);
router.post('/dossiers/:dossierId/taxes/paquet', authenticate, limitePlan, taxes.ajouterDepuisPaquet);
router.put('/dossiers/:dossierId/taxes/:taxeId', authenticate, limitePlan, taxes.modifier);
router.post('/dossiers/:dossierId/taxes/:taxeId/desactiver', authenticate, limitePlan, taxes.desactiver);
router.post('/dossiers/:dossierId/taxes/:taxeId/reactiver', authenticate, limitePlan, taxes.reactiver);

// Étape S5c : les tiers d'un dossier et les imports Excel (D18 : tout ou rien, importExcel.js). Lecture : tout accès au
// dossier ; créer, modifier, désactiver, réactiver un tiers : titulaire, Complet ou Saisie (réponse 4 du 08/10) ;
// supprimer, modèle des codes, import (tiers, plan) : titulaire ou Complet — jugé par le contrôleur. Même limite de
// débit que le plan. Les adresses fixes (/modele, /modele-import, /import, /export) sont déclarées avant /:tiersId.
router.get('/dossiers/:dossierId/plan/modele-import', authenticate, plan.modeleImport);
router.post('/dossiers/:dossierId/plan/import', authenticate, limitePlan, televersement, plan.importer);
router.get('/dossiers/:dossierId/tiers', authenticate, tiers.lire);
router.get('/dossiers/:dossierId/tiers/modele-import', authenticate, tiers.modeleImport);
router.get('/dossiers/:dossierId/tiers/export', authenticate, tiers.exporter);
router.put('/dossiers/:dossierId/tiers/modele', authenticate, limitePlan, tiers.modele);
router.post('/dossiers/:dossierId/tiers/import', authenticate, limitePlan, televersement, tiers.importer);
router.post('/dossiers/:dossierId/tiers', authenticate, limitePlan, tiers.creer);
router.put('/dossiers/:dossierId/tiers/:tiersId', authenticate, limitePlan, tiers.modifier);
router.post('/dossiers/:dossierId/tiers/:tiersId/desactiver', authenticate, limitePlan, tiers.desactiver);
router.post('/dossiers/:dossierId/tiers/:tiersId/reactiver', authenticate, limitePlan, tiers.reactiver);
router.delete('/dossiers/:dossierId/tiers/:tiersId', authenticate, limitePlan, tiers.supprimer);

// Étape S6a : les écritures en brouillard d'un dossier (lecture : tout accès au dossier ; saisir, modifier, supprimer et
// les aides à la saisie : titulaire, Complet ou Saisie — droit « saisir », jugé par le contrôleur). Limite de débit : une
// séance de saisie, c'est une écriture toutes les quelques secondes — 600 par quart d'heure et par personne (aucun compte
// ni email créé) ; les aides (calcul d'une ligne, rien d'écrit) comptent avec. Les adresses fixes (/aide/…) sont
// déclarées avant /:ecritureId.
const limiteEcritures = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 600,
  keyGenerator: (req) => `ecritures:${req.user.id}`,
  message: { message: 'Trop de modifications en peu de temps, réessayez dans un quart d\'heure.' },
  standardHeaders: true,
  legacyHeaders: false,
});
router.get('/dossiers/:dossierId/ecritures', authenticate, ecritures.lire);
router.post('/dossiers/:dossierId/ecritures/aide/taxe', authenticate, limiteEcritures, ecritures.aideTaxe);
router.post('/dossiers/:dossierId/ecritures/aide/retenue', authenticate, limiteEcritures, ecritures.aideRetenue);
router.post('/dossiers/:dossierId/ecritures', authenticate, limiteEcritures, ecritures.creer);
// Étape S6c : les imports Excel d'écritures (en brouillard) et d'une balance d'ouverture (une écriture d'à-nouveaux) —
// tout ou rien, titulaire ou Complet (droit « configurer », jugé par le contrôleur) ; les modèles se lisent à tout niveau.
// Adresses fixes déclarées avant /:ecritureId. Un import analyse un classeur de 5 Mo et écrit jusqu'à mille écritures sous
// le verrou de la comptabilité : 30 par quart d'heure et par personne (relecture de S6c), comme le journal général PDF.
const limiteImports = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  keyGenerator: (req) => `imports:${req.user.id}`,
  message: { message: 'Trop d\'imports en peu de temps, réessayez dans un quart d\'heure.' },
  standardHeaders: true,
  legacyHeaders: false,
});
router.get('/dossiers/:dossierId/ecritures/modele-import', authenticate, importEcritures.modeleEcritures);
router.get('/dossiers/:dossierId/ecritures/modele-balance-ouverture', authenticate, importEcritures.modeleBalance);
router.post('/dossiers/:dossierId/ecritures/import', authenticate, limiteImports, televersement, importEcritures.importerEcritures);
router.post('/dossiers/:dossierId/ecritures/import-balance-ouverture', authenticate, limiteImports, televersement, importEcritures.importerBalance);
router.get('/dossiers/:dossierId/ecritures/:ecritureId', authenticate, ecritures.une);
router.put('/dossiers/:dossierId/ecritures/:ecritureId', authenticate, limiteEcritures, ecritures.modifier);
router.delete('/dossiers/:dossierId/ecritures/:ecritureId', authenticate, limiteEcritures, ecritures.supprimer);

// Étape S6b : la validation (définitive : numéro continu par journal et par exercice), la contre-passation d'une écriture
// validée, les périodes (page, centralisation, clore, rouvrir, journal général PDF). Lecture : tout accès au dossier ;
// valider, valider la période, contre-passer, clore : titulaire ou Complet (droit « configurer ») ; rouvrir : titulaire
// (droit « archiver ») — jugés par le contrôleur. Même limite de débit que la saisie (valider une période = une écriture).
router.post('/dossiers/:dossierId/ecritures/:ecritureId/valider', authenticate, limiteEcritures, validation.valider);
router.post('/dossiers/:dossierId/ecritures/:ecritureId/contrepasser', authenticate, limiteEcritures, validation.contrepasser);
// Le journal général (PDF entier en mémoire : toutes les lignes d'une période) a sa propre limite : 30 par quart d'heure et
// par personne (relecture de S6b) ; S7a : les relevés et les relances ont la leur (limiteDocuments).
const limitePdf = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  keyGenerator: (req) => `pdf:${req.user.id}`,
  message: { message: 'Trop de documents PDF demandés en peu de temps, réessayez dans un quart d\'heure.' },
  standardHeaders: true,
  legacyHeaders: false,
});
router.get('/dossiers/:dossierId/periodes', authenticate, periodes.lire);
router.get('/dossiers/:dossierId/periodes/:periodeId', authenticate, periodes.une);
router.get('/dossiers/:dossierId/periodes/:periodeId/journal-general.pdf', authenticate, limitePdf, periodes.journalGeneral);
router.post('/dossiers/:dossierId/periodes/:periodeId/valider', authenticate, limiteEcritures, validation.validerPeriode);
router.post('/dossiers/:dossierId/periodes/:periodeId/clore', authenticate, limiteEcritures, periodes.clore);
router.post('/dossiers/:dossierId/periodes/:periodeId/rouvrir', authenticate, limiteEcritures, periodes.rouvrir);

// Étape S6c : les livres (balance générale et auxiliaire, grand livre d'un compte ou d'un tiers, livre-journal), calculés
// à la demande sur les écritures validées et en brouillard ; lecture : tout accès au dossier. Les exports Excel (jusqu'à
// 50 000 lignes, classeur construit en mémoire) ont leur propre limite : 60 par quart d'heure et par personne.
const limiteLivres = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  keyGenerator: (req) => `livres:${req.user.id}`,
  message: { message: 'Trop d\'exports demandés en peu de temps, réessayez dans un quart d\'heure.' },
  standardHeaders: true,
  legacyHeaders: false,
});
router.get('/dossiers/:dossierId/livres', authenticate, livres.lire);
router.get('/dossiers/:dossierId/livres/balance', authenticate, livres.balance);
router.get('/dossiers/:dossierId/livres/balance/export', authenticate, limiteLivres, livres.exporterBalance);
router.get('/dossiers/:dossierId/livres/grand-livre', authenticate, livres.grandLivre);
router.get('/dossiers/:dossierId/livres/grand-livre/export', authenticate, limiteLivres, livres.exporterGrandLivre);
router.get('/dossiers/:dossierId/livres/journal', authenticate, livres.journal);
router.get('/dossiers/:dossierId/livres/journal/export', authenticate, limiteLivres, livres.exporterJournal);

// Étape S7a : le lettrage des lignes d'un tiers (lecture : tout accès au dossier ; lettrer, délettrer : titulaire,
// Complet ou Saisie — droit « saisir », jugé par le contrôleur ; même limite de débit que la saisie) et l'échéancier
// (balance âgée, un tiers déplié ; relevé de compte et lettre de relance en PDF sous la limite des PDF ; export Excel sous
// celle des livres). Adresses fixes (/tiers/…, /export) déclarées avant /:lettrageId. La lettre de relance se demande en
// POST (relecture de S7a : son texte, 2 000 caractères, voyage dans le corps et non dans l'adresse) ; elle n'écrit rien.
router.get('/dossiers/:dossierId/lettrage', authenticate, lettrage.lire);
router.get('/dossiers/:dossierId/lettrage/tiers/:tiersId', authenticate, lettrage.unTiers);
router.post('/dossiers/:dossierId/lettrage', authenticate, limiteEcritures, lettrage.lettrer);
router.delete('/dossiers/:dossierId/lettrage/:lettrageId', authenticate, limiteEcritures, lettrage.delettrer);
router.get('/dossiers/:dossierId/echeancier', authenticate, echeancier.lire);
router.get('/dossiers/:dossierId/echeancier/export', authenticate, limiteLivres, echeancier.exporter);
router.get('/dossiers/:dossierId/echeancier/tiers/:tiersId', authenticate, echeancier.unTiers);
// Relevés et relances : leur propre limite (relecture de S7a : une tournée de relevés ne doit pas bloquer le journal
// général) — 120 par quart d'heure et par personne.
const limiteDocuments = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  keyGenerator: (req) => `documents:${req.user.id}`,
  message: { message: 'Trop de relevés ou de relances demandés en peu de temps, réessayez dans un quart d\'heure.' },
  standardHeaders: true,
  legacyHeaders: false,
});
router.get('/dossiers/:dossierId/echeancier/tiers/:tiersId/releve.pdf', authenticate, limiteDocuments, echeancier.releve);
router.post('/dossiers/:dossierId/echeancier/tiers/:tiersId/relance.pdf', authenticate, limiteDocuments, echeancier.relance);

// Routes d'écriture SANS garde par comptabilité (test/comptaS3b.test.js) : elles n'écrivent dans aucune comptabilité.
// Toute autre écriture de ce routeur appelle exigerEcriture (garde.js) : la garde globale de src/app.js ne s'applique
// plus à /api/compta (D4).
// S7a : la lettre de relance (un PDF construit à la demande, en POST pour son texte : rien n'est écrit, elle se lit comme
// le relevé de compte, abonnement non actif compris).
const ECRITURES_SANS_GARDE = ['POST /passage', 'POST /confiees/:espaceId/quitter', 'POST /dossiers/:dossierId/echeancier/tiers/:tiersId/relance.pdf'];
// Écritures permises quel que soit l'abonnement (réponse du client du 07/10, S3c ; test/comptaS3c.test.js) : retirer ou
// désactiver un accès — couper l'accès d'une personne qui part est une mesure de sécurité. Elles passent par la
// transaction verrouillée de leur contrôleur, avec `{ garde: false }`.
const ECRITURES_TOUJOURS_PERMISES = ['DELETE /mes-comptables/:id', 'DELETE /cabinet/gerants/:id', 'POST /cabinet/gerants/:id/desactiver'];

module.exports = router;
module.exports.ECRITURES_SANS_GARDE = ECRITURES_SANS_GARDE;
module.exports.ECRITURES_TOUJOURS_PERMISES = ECRITURES_TOUJOURS_PERMISES;
