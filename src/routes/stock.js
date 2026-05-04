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
} = require('../controllers/stockController');
const { authenticate, requireClient, requireEntreprise } = require('../middleware/auth');

// Client stock (all clients)
router.get('/client/summary', authenticate, requireClient, getStockClientSummary);
router.get('/client', authenticate, requireClient, getStockClient);
router.put('/client/:ingredientId', authenticate, requireClient, updateStockClient);
router.put('/client/:ingredientId/seuil-min', authenticate, requireClient, updateSeuilMinClient);
router.post('/client/pertes', authenticate, requireClient, createClientPerte);
router.get('/client/:ingredientId/history', authenticate, requireClient, getHistoryClient);

// Enterprise stock (entreprise accounts only)
router.get('/entreprise/:activiteId', authenticate, requireEntreprise, getStockEntreprise);
router.put('/entreprise/:activiteId/:ingredientId', authenticate, requireEntreprise, updateStockEntreprise);
router.get('/entreprise/:activiteId/:ingredientId/history', authenticate, requireEntreprise, getHistoryEntreprise);
router.put('/entreprise/:activiteId/:ingredientId/seuil-min', authenticate, requireEntreprise, updateSeuilMin);
router.post('/entreprise/:activiteId/duplicate-franchise', authenticate, requireEntreprise, duplicateStockToFranchise);

// Delete all history for an ingredient (after deselection confirmation)
router.delete('/client/:ingredientId/all-history', authenticate, requireClient, deleteClientIngredientHistory);
router.delete('/entreprise/:activiteId/:ingredientId/all-history', authenticate, requireEntreprise, deleteEntrepriseIngredientHistory);

// Historique Approvisionnement (current year, filtered)
router.get('/historique', authenticate, requireClient, getHistoriqueAppro);
router.get('/historique/export-excel', authenticate, requireClient, exportHistoriqueExcel);
router.put('/historique/:id', authenticate, requireClient, updateHistoriqueEntry);
router.delete('/historique/:id', authenticate, requireClient, deleteHistoriqueEntry);

const { getStockPT, getStockPTHistory, saveStockPT, updateSeuilMinPT } = require('../controllers/produitTransformeController');
router.get('/pt', authenticate, requireClient, getStockPT);
router.get('/pt/:produitId/history', authenticate, requireClient, getStockPTHistory);
router.put('/pt/:produitId', authenticate, requireClient, saveStockPT);
router.put('/pt/:produitId/seuil-min', authenticate, requireClient, updateSeuilMinPT);

module.exports = router;
