const express = require('express');
const { body } = require('express-validator');
const router = express.Router();
const { list, getById, create, update, remove } = require('../controllers/categoriesController');
const { authenticate, requireClient } = require('../middleware/auth');

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

router.get('/', authenticate, requireClient, list);
router.get('/:id', authenticate, requireClient, getById);
router.post('/', authenticate, requireClient, validateNom, create);
router.put('/:id', authenticate, requireClient, validateUpdate, update);
router.delete('/:id', authenticate, requireClient, remove);

module.exports = router;
