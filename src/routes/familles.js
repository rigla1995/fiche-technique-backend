const express = require('express');
const { body } = require('express-validator');
const router = express.Router();
const { list, getById, create, update, remove } = require('../controllers/famillesController');
const { authenticate, requireClient } = require('../middleware/auth');

const validateBody = [
  body().custom((b) => {
    if (!b.name && !b.nom) throw new Error('Nom requis');
    return true;
  }),
];

router.get('/', authenticate, requireClient, list);
router.get('/:id', authenticate, requireClient, getById);
router.post('/', authenticate, requireClient, validateBody, create);
router.put('/:id', authenticate, requireClient, validateBody, update);
router.delete('/:id', authenticate, requireClient, remove);

module.exports = router;
