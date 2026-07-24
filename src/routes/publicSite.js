const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const { creerDemandeAcces, listPartenaires, verifierEmail } = require('../controllers/publicSiteController');

// Rate-limit dédié au formulaire public du site vitrine (modèle : forgotLimiter
// de routes/auth.js) — 5 demandes / 15 min / IP.
const demandeAccesLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { message: 'Trop de demandes envoyées, réessayez dans 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate-limit de la vérification d'email (appelée à la frappe/blur) : plus permissif
// que l'envoi mais borné pour limiter l'énumération d'emails — 30 / 15 min / IP.
const verifEmailLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { existe: false, raison: null },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * @openapi
 * /api/public/demande-acces:
 *   post:
 *     tags: [Public]
 *     summary: Demande d'accès depuis le site vitrine (public, rate-limité)
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [nom, email, telephone]
 *             properties:
 *               nom: { type: string }
 *               email: { type: string, format: email }
 *               telephone: { type: string }
 *               ville: { type: string }
 *               typeActivite: { type: string, enum: [restaurant, cafe_bar, patisserie_boulangerie, boucherie, traiteur, labo_depot, autre] }
 *               nbPointsVente: { type: integer, minimum: 0, maximum: 50 }
 *               aLabo: { type: boolean }
 *               interetB2b: { type: boolean }
 *               message: { type: string }
 *               configCalculateur: { type: object }
 *               website: { type: string, description: 'Honeypot — doit rester vide' }
 *     responses:
 *       200:
 *         description: Réponse uniforme (y compris en dédup silencieuse)
 *       400:
 *         description: Données invalides (message générique)
 *
 * /api/public/partenaires:
 *   get:
 *     tags: [Public]
 *     summary: Logos des clients partenaires affichés sur le site vitrine
 *     security: []
 *     responses:
 *       200:
 *         description: "Liste [{nom, logo}]"
 */
// /tarifs-reference SUPPRIMÉ (2026-07-24, décision client) : la grille tarifaire
// ne doit JAMAIS être exposée ni simulée publiquement. Le calculateur du site
// qui la consommait a disparu en D1 ; la table tarifs_config, elle, reste
// (admin + facturation).
router.post('/demande-acces', demandeAccesLimiter, creerDemandeAcces);
router.get('/verifier-email', verifEmailLimiter, verifierEmail);
router.get('/partenaires', listPartenaires);

module.exports = router;
