const express = require('express');
const router = express.Router();
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

// Client stock (all clients)
router.get('/client/summary', authenticate, requireClient, getStockClientSummary);
router.get('/client/ingredient-selections', authenticate, requireClient, getClientIngredientSelections);
router.get('/client', authenticate, requireClient, getStockClient);
router.put('/client/:ingredientId', authenticate, requireClient, updateStockClient);
router.put('/client/:ingredientId/seuil-min', authenticate, requireClient, updateSeuilMinClient);
router.post('/client/pertes', authenticate, requireClient, createClientPerte);
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
router.put('/entreprise/:activiteId/:ingredientId', authenticate, requireEntreprise, updateStockEntreprise);
router.get('/entreprise/:activiteId/:ingredientId/history', authenticate, requireEntreprise, getHistoryEntreprise);
router.put('/entreprise/:activiteId/:ingredientId/seuil-min', authenticate, requireEntreprise, updateSeuilMin);
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
router.post('/client/inventaire', authenticate, requireClient, saveClientInventaire);
router.get('/client/inventaire/historique', authenticate, requireClient, getClientInventaireHistorique);
router.get('/client/inventaire/historique/export-excel', authenticate, requireClient, exportClientInventaireExcel);
router.get('/entreprise/:activiteId/inventaire', authenticate, requireEntreprise, getActiviteInventaireStock);
router.post('/entreprise/:activiteId/inventaire', authenticate, requireEntreprise, saveActiviteInventaire);
router.get('/entreprise/:activiteId/inventaire/historique', authenticate, requireEntreprise, getActiviteInventaireHistorique);
router.get('/entreprise/:activiteId/inventaire/historique/export-excel', authenticate, requireEntreprise, exportActiviteInventaireExcel);
router.put('/inventaire/:inventaireId', authenticate, requireClient, updateInventaireEntry);

module.exports = router;
