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
  createLaboPerte,
} = require('../controllers/laboController');
const {
  getLaboInventaireStock, saveLaboInventaire,
  getLaboInventaireHistorique, exportLaboInventaireExcel,
} = require('../controllers/inventaireController');
const { getPrixLaboPerte, getDateRangeLaboPerte } = require('../controllers/pertesController');
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
router.get('/:laboId/pertes/prix', authenticate, requireEntreprise, getPrixLaboPerte);
router.get('/:laboId/pertes/date-range', authenticate, requireEntreprise, getDateRangeLaboPerte);
router.post('/:laboId/stock/:ingredientId/perte', authenticate, requireEntreprise, createLaboPerte);

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
router.get('/:laboId/historique/export-excel', authenticate, requireEntreprise, exportLaboHistoriqueExcel);
router.put('/:laboId/historique/:entryId', authenticate, requireEntreprise, updateLaboHistoriqueEntry);
router.delete('/:laboId/historique/:entryId', authenticate, requireEntreprise, deleteLaboHistoriqueEntry);

// Transfers
router.post('/:laboId/transfer', authenticate, requireEntreprise, createTransfer);
router.get('/:laboId/transfers', authenticate, requireEntreprise, getTransferHistory);

// Inventaire labo
router.get('/:laboId/inventaire', authenticate, requireEntreprise, getLaboInventaireStock);
router.post('/:laboId/inventaire', authenticate, requireEntreprise, saveLaboInventaire);
router.get('/:laboId/inventaire/historique', authenticate, requireEntreprise, getLaboInventaireHistorique);
router.get('/:laboId/inventaire/historique/export-excel', authenticate, requireEntreprise, exportLaboInventaireExcel);

module.exports = router;
