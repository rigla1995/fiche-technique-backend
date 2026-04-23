const express = require('express');
const router = express.Router();
const { getStockClient, updateStockClient, getStockEntreprise, updateStockEntreprise } = require('../controllers/stockController');
const { authenticate, requireClient } = require('../middleware/auth');

// Client stock
router.get('/client', authenticate, requireClient, getStockClient);
router.put('/client/:ingredientId', authenticate, requireClient, updateStockClient);

// Enterprise stock (per activité)
router.get('/entreprise/:activiteId', authenticate, requireClient, getStockEntreprise);
router.put('/entreprise/:activiteId/:ingredientId', authenticate, requireClient, updateStockEntreprise);

module.exports = router;
