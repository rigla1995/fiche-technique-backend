const express = require('express');
const { body } = require('express-validator');
const router = express.Router();
const { list, create, update, remove } = require('../controllers/unitesController');
const { authenticate } = require('../middleware/auth');

const validateUnite = [
  body().custom((b) => {
    if (!b.name && !b.nom) throw new Error('Nom de l\'unité requis');
    return true;
  }),
];

router.get('/', authenticate, list);
router.post('/', authenticate, validateUnite, create);
router.put('/:id', authenticate, validateUnite, update);
router.delete('/:id', authenticate, remove);

module.exports = router;
