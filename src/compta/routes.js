// LabFlow Compta — routes du serveur, montées sous /api/compta (chantier Achats & Comptabilité,
// labflow-reprise/achats-compta/SPEC-SOCLE.md). Règles (SPEC-SOCLE §0, D3, D4) : jamais le motif
// « gerant_parent_id || id » ni les gardes clientes (requireClient, requireEntreprise) ; à partir de S2, chaque route
// qui touche une comptabilité vérifie l'accès de la personne à cette comptabilité.
const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { listerAcces } = require('./accesController');

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

module.exports = router;
