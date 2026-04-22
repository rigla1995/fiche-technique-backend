const express = require('express');
const { body } = require('express-validator');
const router = express.Router();
const { list, getById, create, update, remove } = require('../controllers/categoriesController');
const { authenticate, requireSuperAdmin } = require('../middleware/auth');

const validateNom = [
  body().custom((b) => {
    if (!b.name && !b.nom) throw new Error('Nom requis');
    return true;
  }),
];

const validateUpdate = [
  body('name').optional().trim().notEmpty(),
  body('nom').optional().trim().notEmpty(),
];

router.get('/', authenticate, list);
router.get('/:id', authenticate, getById);
router.post('/', authenticate, requireSuperAdmin, validateNom, create);
router.put('/:id', authenticate, requireSuperAdmin, validateUpdate, update);
router.delete('/:id', authenticate, requireSuperAdmin, remove);

module.exports = router;
