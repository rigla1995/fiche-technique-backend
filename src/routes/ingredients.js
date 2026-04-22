const express = require('express');
const { body } = require('express-validator');
const router = express.Router();
const { list, getById, create, update, remove } = require('../controllers/ingredientsController');
const { authenticate, requireSuperAdmin } = require('../middleware/auth');

const validateIngredient = [
  body().custom((b) => {
    if (!b.name && !b.nom) throw new Error('Nom requis');
    return true;
  }),
  body().custom((b) => {
    const prix = b.price !== undefined ? b.price : b.prix;
    if (prix === undefined || prix === null || parseFloat(prix) < 0) throw new Error('Prix invalide (doit être >= 0)');
    return true;
  }),
  body().custom((b) => {
    const uniteId = b.unitId || b.unite_id;
    if (!uniteId || parseInt(uniteId) < 1) throw new Error('Unité invalide');
    return true;
  }),
];

router.get('/', authenticate, list);
router.get('/:id', authenticate, getById);
router.post('/', authenticate, validateIngredient, create);
router.put('/:id', authenticate, [
  body('name').optional().trim().notEmpty(),
  body('nom').optional().trim().notEmpty(),
  body('price').optional().isFloat({ min: 0 }),
  body('prix').optional().isFloat({ min: 0 }),
  body('unitId').optional().isInt({ min: 1 }),
  body('unite_id').optional().isInt({ min: 1 }),
], update);
router.delete('/:id', authenticate, remove);

module.exports = router;
