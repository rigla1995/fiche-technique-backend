const express = require('express');
const router = express.Router();
const { authenticate, requireGerant } = require('../middleware/auth');
const { getDashboard, getAbonnementResume } = require('../controllers/gerantDashboardController');

/**
 * @openapi
 * /api/gerant/dashboard:
 *   get:
 *     tags: [Gérant]
 *     summary: Tableau de bord du gérant (statistiques de son activité)
 *     description: Réservé au rôle gérant. Retourne les KPIs, ventes, alertes stock de l'activité assignée.
 *     responses:
 *       200:
 *         description: Données du tableau de bord
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 activite:
 *                   type: object
 *                   properties:
 *                     id: { type: integer }
 *                     nom: { type: string }
 *                 ventesToday: { type: number }
 *                 ventesThisMonth: { type: number }
 *                 alertesStock: { type: integer }
 *       403:
 *         description: Accès réservé aux gérants
 *
 * /api/gerant/abonnement:
 *   get:
 *     tags: [Gérant]
 *     summary: Résumé de l'abonnement de l'entreprise (vue gérant)
 *     responses:
 *       200:
 *         description: Informations abonnement
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 modeCompte: { type: string }
 *                 dateEcheance: { type: string, format: date, nullable: true }
 *                 entrepriseName: { type: string }
 */
router.get('/dashboard', authenticate, requireGerant, getDashboard);
router.get('/abonnement', authenticate, requireGerant, getAbonnementResume);

module.exports = router;
