const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const {
  getStockClient, updateStockClient, getStockClientSummary,
  getStockEntreprise, updateStockEntreprise,
  getHistoryClient, getHistoryEntreprise,
  getHistoriqueAppro, updateHistoriqueEntry, deleteHistoriqueEntry,
  updateSeuilMin, updateSeuilMinClient, createClientPerte,
  exportHistoriqueExcel,
  deleteClientIngredientHistory, deleteEntrepriseIngredientHistory,
  getCascadeInfoClient, getCascadeInfoEntreprise,
  getClientIngredientSelections,
} = require('../controllers/stockController');
const { authenticate, requireClient, requireEntreprise } = require('../middleware/auth');
const { listClientPertes, updateClientPerte, deleteClientPerte, exportClientPertes, getPrixClientPerte, getDateRangeClientPerte } = require('../controllers/pertesController');

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  next();
};

const approValidation = [
  body('quantite').optional({ nullable: true }).isFloat({ min: 0 }).withMessage('quantite doit être un nombre >= 0'),
  body('prixUnitaire').optional({ nullable: true }).isFloat({ min: 0 }).withMessage('prixUnitaire doit être un nombre >= 0'),
  body('dateAppro').optional({ nullable: true }).isISO8601().withMessage('dateAppro doit être une date ISO8601'),
  body('fournisseurId').optional({ nullable: true }).isInt({ min: 1 }).withMessage('fournisseurId invalide'),
  body('tauxTva').optional({ nullable: true }).isFloat({ min: 0, max: 100 }).withMessage('tauxTva doit être entre 0 et 100'),
];

const seuilMinValidation = [
  body('seuilMin').optional({ nullable: true }).isFloat({ min: 0 }).withMessage('seuilMin doit être un nombre >= 0'),
];

const perteValidation = [
  body('ingredientId').isInt({ min: 1 }).withMessage('ingredientId invalide'),
  body('quantite').isFloat({ min: 0.001 }).withMessage('quantite doit être > 0'),
  body('typePerte').isIn(['avarie', 'dechet']).withMessage('typePerte invalide (avarie|dechet)'),
  body('datePerte').isISO8601().withMessage('datePerte doit être une date ISO8601'),
];

const inventaireValidation = [
  body('dateInventaire').isISO8601().withMessage('dateInventaire doit être une date ISO8601'),
  body('entries').isArray({ min: 1 }).withMessage('entries doit être un tableau non vide'),
  body('entries.*.quantiteReelle').isFloat({ min: 0 }).withMessage('quantiteReelle doit être un nombre >= 0'),
];

// Client stock (all clients)
router.get('/client/summary', authenticate, requireClient, getStockClientSummary);
router.get('/client/ingredient-selections', authenticate, requireClient, getClientIngredientSelections);
router.get('/client', authenticate, requireClient, getStockClient);
router.put('/client/:ingredientId', authenticate, requireClient, approValidation, validate, updateStockClient);
router.put('/client/:ingredientId/seuil-min', authenticate, requireClient, seuilMinValidation, validate, updateSeuilMinClient);
router.post('/client/pertes', authenticate, requireClient, perteValidation, validate, createClientPerte);
router.get('/client/pertes/export-excel', authenticate, requireClient, exportClientPertes);
router.get('/client/pertes/prix', authenticate, requireClient, getPrixClientPerte);
router.get('/client/pertes/date-range', authenticate, requireClient, getDateRangeClientPerte);
router.get('/client/pertes', authenticate, requireClient, listClientPertes);
router.put('/client/pertes/:id', authenticate, requireClient, updateClientPerte);
router.delete('/client/pertes/:id', authenticate, requireClient, deleteClientPerte);
router.get('/client/:ingredientId/history', authenticate, requireClient, getHistoryClient);

/**
 * @openapi
 * /api/stock/entreprise/{activiteId}:
 *   get:
 *     tags: [Stock]
 *     summary: Récupérer le stock d'une activité entreprise
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: activiteId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID de l'activité
 *     responses:
 *       200:
 *         description: Stock de l'activité
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   ingredientId:
 *                     type: integer
 *                   nom:
 *                     type: string
 *                   quantite:
 *                     type: number
 *                   unite:
 *                     type: string
 *                   seuilMin:
 *                     type: number
 *       401:
 *         description: Non authentifié
 *       403:
 *         description: Accès réservé aux entreprises
 */
router.get('/entreprise/:activiteId', authenticate, requireEntreprise, getStockEntreprise);

/**
 * @openapi
 * /api/stock/entreprise/{activiteId}/{ingredientId}:
 *   put:
 *     tags: [Stock]
 *     summary: Mettre à jour la quantité d'un ingrédient en stock pour une activité
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: activiteId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID de l'activité
 *       - in: path
 *         name: ingredientId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID de l'ingrédient
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [quantite]
 *             properties:
 *               quantite:
 *                 type: number
 *               fournisseurId:
 *                 type: integer
 *               prixUnitaire:
 *                 type: number
 *     responses:
 *       200:
 *         description: Stock mis à jour
 *       400:
 *         description: Données invalides
 *       401:
 *         description: Non authentifié
 */
router.put('/entreprise/:activiteId/:ingredientId', authenticate, requireEntreprise, approValidation, validate, updateStockEntreprise);
router.get('/entreprise/:activiteId/:ingredientId/history', authenticate, requireEntreprise, getHistoryEntreprise);
router.put('/entreprise/:activiteId/:ingredientId/seuil-min', authenticate, requireEntreprise, seuilMinValidation, validate, updateSeuilMin);
// Cascade info (appro + inventaire counts) for ingredient deselect confirmation
router.get('/client/:ingredientId/cascade-info', authenticate, requireClient, getCascadeInfoClient);
router.get('/entreprise/:activiteId/:ingredientId/cascade-info', authenticate, requireEntreprise, getCascadeInfoEntreprise);

// Delete all history + inventaires for an ingredient (after deselection confirmation)
router.delete('/client/:ingredientId/all-history', authenticate, requireClient, deleteClientIngredientHistory);
router.delete('/entreprise/:activiteId/:ingredientId/all-history', authenticate, requireEntreprise, deleteEntrepriseIngredientHistory);

// Historique Approvisionnement (current year, filtered)
router.get('/historique', authenticate, requireClient, getHistoriqueAppro);
router.get('/historique/export-excel', authenticate, requireClient, exportHistoriqueExcel);
router.put('/historique/:id', authenticate, requireClient, updateHistoriqueEntry);
router.delete('/historique/:id', authenticate, requireClient, deleteHistoriqueEntry);

const { getStockPT, getStockPTHistory, getPTRecipe, saveStockPT, updateSeuilMinPT } = require('../controllers/produitTransformeController');
router.get('/pt', authenticate, requireClient, getStockPT);
router.get('/pt/:produitId/recipe', authenticate, requireClient, getPTRecipe);
router.get('/pt/:produitId/history', authenticate, requireClient, getStockPTHistory);
router.put('/pt/:produitId', authenticate, requireClient, saveStockPT);
router.put('/pt/:produitId/seuil-min', authenticate, requireClient, updateSeuilMinPT);

// Inventaire activite
const {
  getActiviteInventaireStock, saveActiviteInventaire,
  getActiviteInventaireHistorique, exportActiviteInventaireExcel,
  updateInventaireEntry,
  getClientInventaireStock, saveClientInventaire,
  getClientInventaireHistorique, exportClientInventaireExcel,
} = require('../controllers/inventaireController');
router.get('/client/inventaire', authenticate, requireClient, getClientInventaireStock);
router.post('/client/inventaire', authenticate, requireClient, inventaireValidation, validate, saveClientInventaire);
router.get('/client/inventaire/historique', authenticate, requireClient, getClientInventaireHistorique);
router.get('/client/inventaire/historique/export-excel', authenticate, requireClient, exportClientInventaireExcel);
router.get('/entreprise/:activiteId/inventaire', authenticate, requireEntreprise, getActiviteInventaireStock);
router.post('/entreprise/:activiteId/inventaire', authenticate, requireEntreprise, inventaireValidation, validate, saveActiviteInventaire);
router.get('/entreprise/:activiteId/inventaire/historique', authenticate, requireEntreprise, getActiviteInventaireHistorique);
router.get('/entreprise/:activiteId/inventaire/historique/export-excel', authenticate, requireEntreprise, exportActiviteInventaireExcel);
router.put('/inventaire/:inventaireId', authenticate, requireClient, updateInventaireEntry);

module.exports = router;
