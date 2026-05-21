const express = require('express');
const { body } = require('express-validator');
const router = express.Router();
const { list, getById, create, update, remove, hasArticles } = require('../controllers/articlesController');
const { authenticate, requireClient } = require('../middleware/auth');

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
  body().custom((b) => {
    const prix = b.price !== undefined ? b.price : b.prix;
    if (prix !== undefined && prix !== null && parseFloat(prix) < 0) throw new Error('Prix invalide (doit être >= 0)');
    return true;
  }),
];

router.get('/', authenticate, requireClient, list);
router.get('/has-articles', authenticate, requireClient, hasArticles);
router.get('/:id', authenticate, requireClient, getById);
router.post('/', authenticate, requireClient, validateCreate, create);
router.put('/:id', authenticate, requireClient, [
  body('name').optional().trim().notEmpty(),
  body('nom').optional().trim().notEmpty(),
  body('price').optional({ nullable: true }).isFloat({ min: 0 }),
  body('prix').optional({ nullable: true }).isFloat({ min: 0 }),
  body('unitId').optional().isInt({ min: 1 }),
  body('unite_id').optional().isInt({ min: 1 }),
  body('categorieId').optional({ nullable: true }).isInt({ min: 1 }),
  body('seuilMin').optional({ nullable: true }).isFloat({ min: 0 }),
], update);
router.delete('/:id', authenticate, requireClient, remove);

module.exports = router;
