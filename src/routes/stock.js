const express = require('express');
const router = express.Router();
const { getStockClient, updateStockClient, getStockEntreprise, updateStockEntreprise } = require('../controllers/stockController');
const { authenticate, requireClient, requireEntreprise } = require('../middleware/auth');

// Client stock (all clients)
router.get('/client', authenticate, requireClient, getStockClient);
router.put('/client/:ingredientId', authenticate, requireClient, updateStockClient);

// Enterprise stock (entreprise accounts only)
router.get('/entreprise/:activiteId', authenticate, requireEntreprise, getStockEntreprise);
router.put('/entreprise/:activiteId/:ingredientId', authenticate, requireEntreprise, updateStockEntreprise);

module.exports = router;
