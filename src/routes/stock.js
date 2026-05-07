const express = require('express');
const router = express.Router();
const {
  getStockClient, updateStockClient, getStockClientSummary,
  getStockEntreprise, updateStockEntreprise,
  getHistoryClient, getHistoryEntreprise,
  getHistoriqueAppro, updateHistoriqueEntry, deleteHistoriqueEntry,
  duplicateStockToFranchise,
  updateSeuilMin, updateSeuilMinClient, createClientPerte,
  exportHistoriqueExcel,
  deleteClientIngredientHistory, deleteEntrepriseIngredientHistory,
  getCascadeInfoClient, getCascadeInfoEntreprise,
} = require('../controllers/stockController');
const { authenticate, requireClient, requireEntreprise } = require('../middleware/auth');
const { listClientPertes, updateClientPerte, deleteClientPerte, exportClientPertes, getPrixClientPerte, getDateRangeClientPerte } = require('../controllers/pertesController');

// Client stock (all clients)
router.get('/client/summary', authenticate, requireClient, getStockClientSummary);
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

// Enterprise stock (entreprise accounts only)
router.get('/entreprise/:activiteId', authenticate, requireEntreprise, getStockEntreprise);
router.put('/entreprise/:activiteId/:ingredientId', authenticate, requireEntreprise, updateStockEntreprise);
router.get('/entreprise/:activiteId/:ingredientId/history', authenticate, requireEntreprise, getHistoryEntreprise);
router.put('/entreprise/:activiteId/:ingredientId/seuil-min', authenticate, requireEntreprise, updateSeuilMin);
router.post('/entreprise/:activiteId/duplicate-franchise', authenticate, requireEntreprise, duplicateStockToFranchise);

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

// Inventaire activite (franchise / distinct)
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
router.put('/inventaire/:inventaireId', authenticate, updateInventaireEntry);

module.exports = router;
