const express = require('express');
const router = express.Router();
const {
  getEntreprise, upsertEntreprise,
  listActivites, createActivite, updateActivite, deleteActivite, duplicateActivite,
  hasActivites, getActiviteIngredients, toggleActiviteIngredient, updateIngredientPrice,
  getActiviteTypesSummary,
  getActiviteSelectedIngredients, getTypeSelectedIngredients,
  getCatalogueGlobalIngredients,
} = require('../controllers/entrepriseController');
const { listFournisseurs, getFournisseursForActivite, createFournisseur, updateFournisseur, deleteFournisseur } = require('../controllers/fournisseurController');
const { createPerte, listPertes, listEntreprisePertes, updateEntreprisePerte, deleteEntreprisePerte, exportEntreprisePertes, getPrixEntreprisePerte, getDateRangeEntreprisePerte } = require('../controllers/pertesController');
const { authenticate, requireEntreprise } = require('../middleware/auth');

/**
 * @openapi
 * /api/entreprise:
 *   get:
 *     tags: [Entreprise]
 *     summary: Récupérer le profil de l'entreprise
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Profil entreprise
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: integer
 *                 nom:
 *                   type: string
 *                 domaineId:
 *                   type: integer
 *       401:
 *         description: Non authentifié
 *       403:
 *         description: Accès réservé aux entreprises
 */
router.get('/', authenticate, requireEntreprise, getEntreprise);

/**
 * @openapi
 * /api/entreprise:
 *   put:
 *     tags: [Entreprise]
 *     summary: Créer ou mettre à jour le profil de l'entreprise
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               nom:
 *                 type: string
 *               domaineId:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Profil mis à jour
 *       401:
 *         description: Non authentifié
 *       403:
 *         description: Accès réservé aux entreprises
 */
router.put('/', authenticate, requireEntreprise, upsertEntreprise);

// Activities
router.get('/activites/has', authenticate, requireEntreprise, hasActivites);
router.get('/activites/types-summary', authenticate, requireEntreprise, getActiviteTypesSummary);
router.get('/activites/selected-ingredients', authenticate, requireEntreprise, getTypeSelectedIngredients);

/**
 * @openapi
 * /api/entreprise/catalogue-global-ingredients:
 *   get:
 *     tags: [Entreprise]
 *     summary: Récupérer le catalogue global d'ingrédients avec filtrage par domaine
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: domaineId
 *         schema:
 *           type: integer
 *         description: Filtrer par domaine
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Recherche textuelle
 *     responses:
 *       200:
 *         description: Liste d'ingrédients du catalogue
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: integer
 *                   nom:
 *                     type: string
 *                   unite:
 *                     type: string
 *       401:
 *         description: Non authentifié
 */
router.get('/catalogue-global-ingredients', authenticate, requireEntreprise, getCatalogueGlobalIngredients);

/**
 * @openapi
 * /api/entreprise/activites:
 *   get:
 *     tags: [Activites]
 *     summary: Lister les activités de l'entreprise
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Liste des activités
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: integer
 *                   nom:
 *                     type: string
 *                   type:
 *                     type: string
 *       401:
 *         description: Non authentifié
 */
router.get('/activites', authenticate, requireEntreprise, listActivites);

/**
 * @openapi
 * /api/entreprise/activites:
 *   post:
 *     tags: [Activites]
 *     summary: Créer une nouvelle activité
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [nom]
 *             properties:
 *               nom:
 *                 type: string
 *               type:
 *                 type: string
 *     responses:
 *       201:
 *         description: Activité créée
 *       400:
 *         description: Données invalides
 *       401:
 *         description: Non authentifié
 */
router.post('/activites', authenticate, requireEntreprise, createActivite);
router.put('/activites/:id', authenticate, requireEntreprise, updateActivite);
router.delete('/activites/:id', authenticate, requireEntreprise, deleteActivite);
router.post('/activites/:id/duplicate', authenticate, requireEntreprise, duplicateActivite);

/**
 * @openapi
 * /api/entreprise/activites/{id}/ingredients:
 *   get:
 *     tags: [Activites]
 *     summary: Récupérer les ingrédients d'une activité
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID de l'activité
 *     responses:
 *       200:
 *         description: Liste des ingrédients de l'activité
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: integer
 *                   nom:
 *                     type: string
 *                   selected:
 *                     type: boolean
 *                   prix:
 *                     type: number
 *       401:
 *         description: Non authentifié
 *       404:
 *         description: Activité introuvable
 */
router.get('/activites/:id/ingredients', authenticate, requireEntreprise, getActiviteIngredients);
router.get('/activites/:id/selected-ingredients', authenticate, requireEntreprise, getActiviteSelectedIngredients);
router.post('/activites/:id/ingredients/:ingredientId/select', authenticate, requireEntreprise, toggleActiviteIngredient);
router.put('/activites/:id/ingredients/:ingredientId/price', authenticate, requireEntreprise, updateIngredientPrice);

// Fournisseurs
router.get('/fournisseurs', authenticate, requireEntreprise, listFournisseurs);
router.post('/fournisseurs', authenticate, requireEntreprise, createFournisseur);
router.put('/fournisseurs/:id', authenticate, requireEntreprise, updateFournisseur);
router.delete('/fournisseurs/:id', authenticate, requireEntreprise, deleteFournisseur);
router.get('/activites/:activiteId/fournisseurs', authenticate, requireEntreprise, getFournisseursForActivite);

/**
 * @openapi
 * /api/entreprise/activites/{activiteId}/pertes:
 *   post:
 *     tags: [Pertes]
 *     summary: Enregistrer une perte pour une activité
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: activiteId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID de l'activité
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [ingredientId, quantite]
 *             properties:
 *               ingredientId:
 *                 type: integer
 *               quantite:
 *                 type: number
 *               date:
 *                 type: string
 *                 format: date
 *               motif:
 *                 type: string
 *     responses:
 *       201:
 *         description: Perte enregistrée
 *       400:
 *         description: Données invalides
 *       401:
 *         description: Non authentifié
 */
router.post('/activites/:activiteId/pertes', authenticate, requireEntreprise, createPerte);
router.get('/activites/:activiteId/pertes', authenticate, requireEntreprise, listPertes);

// Pertes historique (all activités combined)
router.get('/pertes/export-excel', authenticate, requireEntreprise, exportEntreprisePertes);
router.get('/pertes/prix', authenticate, requireEntreprise, getPrixEntreprisePerte);
router.get('/pertes/date-range', authenticate, requireEntreprise, getDateRangeEntreprisePerte);
router.get('/pertes', authenticate, requireEntreprise, listEntreprisePertes);
router.put('/pertes/:id', authenticate, requireEntreprise, updateEntreprisePerte);
router.delete('/pertes/:id', authenticate, requireEntreprise, deleteEntreprisePerte);

module.exports = router;
