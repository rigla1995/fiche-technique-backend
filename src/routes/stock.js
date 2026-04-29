const express = require('express');
const router = express.Router();
const {
  getStockClient, updateStockClient,
  getStockEntreprise, updateStockEntreprise,
  getHistoryClient, getHistoryEntreprise,
  getHistoriqueAppro, updateHistoriqueEntry, deleteHistoriqueEntry,
  duplicateStockToFranchise,
  updateSeuilMin,
} = require('../controllers/stockController');
const { authenticate, requireClient, requireEntreprise } = require('../middleware/auth');

// Client stock (all clients)
router.get('/client', authenticate, requireClient, getStockClient);
router.put('/client/:ingredientId', authenticate, requireClient, updateStockClient);
router.get('/client/:ingredientId/history', authenticate, requireClient, getHistoryClient);

// Enterprise stock (entreprise accounts only)
router.get('/entreprise/:activiteId', authenticate, requireEntreprise, getStockEntreprise);
router.put('/entreprise/:activiteId/:ingredientId', authenticate, requireEntreprise, updateStockEntreprise);
router.get('/entreprise/:activiteId/:ingredientId/history', authenticate, requireEntreprise, getHistoryEntreprise);
router.put('/entreprise/:activiteId/:ingredientId/seuil-min', authenticate, requireEntreprise, updateSeuilMin);
router.post('/entreprise/:activiteId/duplicate-franchise', authenticate, requireEntreprise, duplicateStockToFranchise);

// Historique Approvisionnement (current year, filtered)
router.get('/historique', authenticate, requireClient, getHistoriqueAppro);
router.put('/historique/:id', authenticate, requireClient, updateHistoriqueEntry);
router.delete('/historique/:id', authenticate, requireClient, deleteHistoriqueEntry);

module.exports = router;
