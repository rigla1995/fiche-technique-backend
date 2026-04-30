const express = require('express');
const router = express.Router();
const {
  createLabo, listLabos, getLaboById,
  getLaboIngredients, toggleLaboIngredient,
  getLaboStock, updateLaboStock, getLaboStockHistory,
  getLaboFournisseurs, syncLaboFournisseurs,
  updateLaboSeuilMin,
  createTransfer, getTransferHistory,
  getActivityAssignments, toggleActivityAssignment,
  getLaboHistorique, updateLaboHistoriqueEntry, deleteLaboHistoriqueEntry,
  exportLaboHistoriqueExcel,
} = require('../controllers/laboController');
const { authenticate, requireEntreprise } = require('../middleware/auth');

// Labo CRUD
router.get('/', authenticate, requireEntreprise, listLabos);
router.post('/', authenticate, requireEntreprise, createLabo);
router.get('/:laboId', authenticate, requireEntreprise, getLaboById);

// Labo ingredient selections
router.get('/:laboId/ingredients', authenticate, requireEntreprise, getLaboIngredients);
router.post('/:laboId/ingredients/:ingredientId/select', authenticate, requireEntreprise, toggleLaboIngredient);

// Labo stock
router.get('/:laboId/stock', authenticate, requireEntreprise, getLaboStock);
router.put('/:laboId/stock/:ingredientId', authenticate, requireEntreprise, updateLaboStock);
router.get('/:laboId/stock/:ingredientId/history', authenticate, requireEntreprise, getLaboStockHistory);

// Labo fournisseurs (non-labo fournisseurs assigned to this labo)
router.get('/:laboId/fournisseurs', authenticate, requireEntreprise, getLaboFournisseurs);
router.put('/:laboId/fournisseurs/sync', authenticate, requireEntreprise, syncLaboFournisseurs);

// Labo ingredient seuil min
router.put('/:laboId/ingredients/:ingredientId/seuil-min', authenticate, requireEntreprise, updateLaboSeuilMin);

// Activity ingredient assignments
router.get('/:laboId/activity-assignments', authenticate, requireEntreprise, getActivityAssignments);
router.post('/:laboId/ingredients/:ingredientId/assign-to-activity', authenticate, requireEntreprise, toggleActivityAssignment);

// Labo historique appro
router.get('/:laboId/historique', authenticate, requireEntreprise, getLaboHistorique);
router.post('/:laboId/historique/export-excel', authenticate, requireEntreprise, exportLaboHistoriqueExcel);
router.put('/:laboId/historique/:entryId', authenticate, requireEntreprise, updateLaboHistoriqueEntry);
router.delete('/:laboId/historique/:entryId', authenticate, requireEntreprise, deleteLaboHistoriqueEntry);

// Transfers
router.post('/:laboId/transfer', authenticate, requireEntreprise, createTransfer);
router.get('/:laboId/transfers', authenticate, requireEntreprise, getTransferHistory);

module.exports = router;
