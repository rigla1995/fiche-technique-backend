// LabFlow Compta — routes de l'admin pour les cabinets comptables (étape S2b), montées sous /admin/comptables dans
// src/app.js AVANT /admin. Réservées au super_admin et au boss (requireSuperAdmin).
const express = require('express');
const router = express.Router();
const { authenticate, requireSuperAdmin } = require('../middleware/auth');
const c = require('./cabinetsController');

router.use(authenticate, requireSuperAdmin);

/**
 * @openapi
 * /admin/comptables:
 *   get:
 *     tags: [Compta]
 *     summary: Cabinets comptables (titulaires de LabFlow Compta), identité, abonnement et mensualité
 *   post:
 *     tags: [Compta]
 *     summary: Crée un cabinet en une transaction (compte, identité, abonnement, mensualité, promotions, espace) et envoie l'activation vers compta.
 */
router.get('/', c.list);
router.post('/', c.create);
router.get('/apercu-prix', c.apercuPrix);
// Étape S3c : adresse libre, déjà prise, ou compte LabFlow Compta auquel le cabinet sera rattaché.
router.get('/adresse', c.verifierAdresse);
router.get('/:id', c.get);
router.put('/:id/identite', c.updateIdentite);
router.put('/:id/gerants', c.updateGerants);
router.post('/:id/invitation', c.renvoyerInvitation);
router.delete('/:id', c.remove);

module.exports = router;
