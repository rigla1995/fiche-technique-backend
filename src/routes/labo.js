const express = require('express');
const router = express.Router();
const {
  createLabo, listLabos, getLaboById,
  getLaboIngredients, toggleLaboIngredient,
  getLaboStock, updateLaboStock, getLaboStockHistory,
  updateLaboSeuilMin,
  createTransfer, getTransferHistory,
  getActivityAssignments, toggleActivityAssignment,
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

// Labo ingredient seuil min
router.put('/:laboId/ingredients/:ingredientId/seuil-min', authenticate, requireEntreprise, updateLaboSeuilMin);

// Activity ingredient assignments
router.get('/:laboId/activity-assignments', authenticate, requireEntreprise, getActivityAssignments);
router.post('/:laboId/ingredients/:ingredientId/assign-to-activity', authenticate, requireEntreprise, toggleActivityAssignment);

// Transfers
router.post('/:laboId/transfer', authenticate, requireEntreprise, createTransfer);
router.get('/:laboId/transfers', authenticate, requireEntreprise, getTransferHistory);

module.exports = router;
