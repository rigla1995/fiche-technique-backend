const express = require('express');
const { body } = require('express-validator');
const router = express.Router();
const {
  list, getById, create, update, remove,
  addIngredient, removeIngredient,
  addSousProduit, removeSousProduit,
  getCout, getStockDates, getStockCheck, getManualPrices, saveManualPrices,
  exportListExcel,
} = require('../controllers/produitsController');
const { exportExcel } = require('../controllers/exportController');
const { authenticate, requireClient } = require('../middleware/auth');

router.get('/', authenticate, requireClient, list);
router.get('/export-list', authenticate, requireClient, exportListExcel);
router.get('/:id', authenticate, requireClient, getById);
router.post('/', authenticate, requireClient, [
  body().custom((b) => {
    if (!b.name && !b.nom) throw new Error('Nom requis');
    return true;
  }),
  body('type').optional().isIn(['utilisable', 'vendable']),
], create);
router.put('/:id', authenticate, requireClient, [
  body('name').optional().trim().notEmpty(),
  body('nom').optional().trim().notEmpty(),
  body('type').optional().isIn(['utilisable', 'vendable']),
], update);
router.delete('/:id', authenticate, requireClient, remove);

// Composition : ingrédients
router.post('/:id/ingredients', authenticate, requireClient, [
  body().custom((b) => {
    const id = b.ingredientId || b.ingredient_id;
    if (!id || parseInt(id) < 1) throw new Error('Ingrédient invalide');
    return true;
  }),
  body('portion').isFloat({ min: 0.001 }).withMessage('Portion invalide'),
  body().custom((b) => {
    const id = b.unitId || b.unite_id;
    if (!id || parseInt(id) < 1) throw new Error('Unité invalide');
    return true;
  }),
], addIngredient);
router.delete('/:id/ingredients/:ingredientId', authenticate, requireClient, removeIngredient);

// Composition : sous-produits
router.post('/:id/sous-produits', authenticate, requireClient, [
  body().custom((b) => {
    const id = b.productId || b.produit_id;
    if (!id || parseInt(id) < 1) throw new Error('Sous-produit invalide');
    return true;
  }),
  body('portion').isFloat({ min: 0.001 }).withMessage('Portion invalide'),
], addSousProduit);
router.delete('/:id/sous-produits/:sousProduitId', authenticate, requireClient, removeSousProduit);

// Calcul coût & export
router.get('/:id/cout', authenticate, requireClient, getCout);
router.get('/:id/export', authenticate, requireClient, exportExcel);

// Fiche technique — stock check, dates & prix manuels
router.get('/:id/stock-dates', authenticate, requireClient, getStockDates);
router.get('/:id/stock-check', authenticate, requireClient, getStockCheck);
router.get('/:id/manual-prices', authenticate, requireClient, getManualPrices);
router.post('/:id/manual-prices', authenticate, requireClient, saveManualPrices);

const { toggleStockIngredient, deleteStockPTHistory, getStockActivites, affecterActivites } = require('../controllers/produitTransformeController');
router.get('/:id/stock-activites', authenticate, requireClient, getStockActivites);
router.post('/:id/toggle-stock-ingredient', authenticate, requireClient, toggleStockIngredient);
router.delete('/:id/stock-pt-history', authenticate, requireClient, deleteStockPTHistory);
router.post('/:id/affecter-activites', authenticate, requireClient, affecterActivites);

module.exports = router;
