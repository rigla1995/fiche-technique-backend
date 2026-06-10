const express = require('express');
const router = express.Router();
const { authenticate, requireClient } = require('../middleware/auth');
const r = require('../controllers/rapportsController');

/**
 * @openapi
 * /api/rapports/filters:
 *   get:
 *     tags: [Rapports]
 *     summary: Récupérer les filtres disponibles pour les rapports (activités, labos, périodes)
 *     responses:
 *       200:
 *         description: Filtres disponibles
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 activites:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id: { type: integer }
 *                       nom: { type: string }
 *                 labos:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id: { type: integer }
 *                       nom: { type: string }
 *
 * /api/rapports/pertes:
 *   get:
 *     tags: [Rapports]
 *     summary: Rapport des pertes par période et activité
 *     parameters:
 *       - in: query
 *         name: activiteId
 *         schema: { type: integer }
 *       - in: query
 *         name: laboId
 *         schema: { type: integer }
 *       - in: query
 *         name: dateDebut
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: dateFin
 *         schema: { type: string, format: date }
 *     responses:
 *       200:
 *         description: Données du rapport pertes
 *
 * /api/rapports/cout-matiere:
 *   get:
 *     tags: [Rapports]
 *     summary: Rapport coût matière par activité et période
 *     parameters:
 *       - in: query
 *         name: activiteId
 *         schema: { type: integer }
 *       - in: query
 *         name: dateDebut
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: dateFin
 *         schema: { type: string, format: date }
 *     responses:
 *       200:
 *         description: Données du rapport coût matière
 *
 * /api/rapports/appros:
 *   get:
 *     tags: [Rapports]
 *     summary: Rapport des approvisionnements
 *     parameters:
 *       - in: query
 *         name: activiteId
 *         schema: { type: integer }
 *       - in: query
 *         name: dateDebut
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: dateFin
 *         schema: { type: string, format: date }
 *     responses:
 *       200:
 *         description: Données du rapport appros
 *
 * /api/rapports/stock:
 *   get:
 *     tags: [Rapports]
 *     summary: Rapport valorisation du stock
 *     parameters:
 *       - in: query
 *         name: activiteId
 *         schema: { type: integer }
 *       - in: query
 *         name: laboId
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Données du rapport stock
 *
 * /api/rapports/activites:
 *   get:
 *     tags: [Rapports]
 *     summary: Rapport global multi-activités
 *     parameters:
 *       - in: query
 *         name: dateDebut
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: dateFin
 *         schema: { type: string, format: date }
 *     responses:
 *       200:
 *         description: Données du rapport multi-activités
 */
router.get('/filters',       authenticate, requireClient, r.getRapportFilters);
router.get('/pertes',        authenticate, requireClient, r.getRapportPertes);
router.get('/cout-matiere',  authenticate, requireClient, r.getRapportCoutMatiere);
router.get('/appros',        authenticate, requireClient, r.getRapportAppros);
router.get('/stock',         authenticate, requireClient, r.getRapportStock);
router.get('/activites',     authenticate, requireClient, r.getRapportActivites);

module.exports = router;
