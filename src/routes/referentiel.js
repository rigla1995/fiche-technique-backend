const express = require('express');
const router = express.Router();
const { getTemplate, importReferentiel, getArticleAssignments } = require('../controllers/referentielController');
const { authenticate, requireClient } = require('../middleware/auth');

/**
 * @openapi
 * /api/referentiel/template:
 *   get:
 *     tags: [Référentiel]
 *     summary: Télécharger le template Excel d'import du référentiel
 *     responses:
 *       200:
 *         description: Fichier Excel template
 *         content:
 *           application/vnd.openxmlformats-officedocument.spreadsheetml.sheet:
 *             schema:
 *               type: string
 *               format: binary
 *
 * /api/referentiel/import:
 *   post:
 *     tags: [Référentiel]
 *     summary: Importer le référentiel articles depuis un fichier Excel
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [file]
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: Fichier Excel (.xlsx) conforme au template
 *     responses:
 *       200:
 *         description: Import effectué
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 imported: { type: integer }
 *                 skipped: { type: integer }
 *                 errors: { type: array, items: { type: string } }
 *       400:
 *         description: Fichier invalide ou manquant
 *
 * /api/referentiel/articles/{id}/assignments:
 *   get:
 *     tags: [Référentiel]
 *     summary: Récupérer les affectations d'un article aux activités / labos
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *         description: ID de l'article
 *     responses:
 *       200:
 *         description: Affectations de l'article
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
 *                       assigned: { type: boolean }
 *                 labos:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id: { type: integer }
 *                       nom: { type: string }
 *                       assigned: { type: boolean }
 */
router.get('/template', authenticate, requireClient, getTemplate);
router.post('/import', authenticate, requireClient, importReferentiel);
router.get('/articles/:id/assignments', authenticate, requireClient, getArticleAssignments);

module.exports = router;
