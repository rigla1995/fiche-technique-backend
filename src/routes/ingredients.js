const express = require('express');
const { body } = require('express-validator');
const router = express.Router();
const { list, getById, create, update, remove, setClientPrice } = require('../controllers/ingredientsController');
const { authenticate, requireSuperAdmin, requireClient } = require('../middleware/auth');

const validateCreate = [
  body().custom((b) => {
    if (!b.name && !b.nom) throw new Error('Nom requis');
    return true;
  }),
  body().custom((b) => {
    const uniteId = b.unitId || b.unite_id;
    if (!uniteId || parseInt(uniteId) < 1) throw new Error('Unité invalide');
    return true;
  }),
  // Price is now optional (admin creates without price)
  body().custom((b) => {
    const prix = b.price !== undefined ? b.price : b.prix;
    if (prix !== undefined && prix !== null && parseFloat(prix) < 0) throw new Error('Prix invalide (doit être >= 0)');
    return true;
  }),
];

router.get('/', authenticate, list);
router.get('/:id', authenticate, getById);
router.post('/', authenticate, validateCreate, create);
router.put('/:id', authenticate, [
  body('name').optional().trim().notEmpty(),
  body('nom').optional().trim().notEmpty(),
  body('price').optional({ nullable: true }).isFloat({ min: 0 }),
  body('prix').optional({ nullable: true }).isFloat({ min: 0 }),
  body('unitId').optional().isInt({ min: 1 }),
  body('unite_id').optional().isInt({ min: 1 }),
  body('categorieId').optional({ nullable: true }).isInt({ min: 1 }),
  body('categorie_id').optional({ nullable: true }).isInt({ min: 1 }),
], update);
router.delete('/:id', authenticate, remove);

// Client sets their own purchase price for an ingredient
router.put('/:id/price', authenticate, requireClient, setClientPrice);

module.exports = router;
