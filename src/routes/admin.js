const express = require('express');
const { body } = require('express-validator');
const router = express.Router();
const { list, getById, create, update, remove } = require('../controllers/clientsController');
const { authenticate, requireSuperAdmin } = require('../middleware/auth');

const validateCreate = [
  body().custom((b) => {
    if (!b.name && !b.nom) throw new Error('Nom requis');
    return true;
  }),
  body('email').isEmail().withMessage('Email invalide'),
  body().custom((b) => {
    const pwd = b.password || b.mot_de_passe;
    if (pwd && pwd.length < 8) throw new Error('Mot de passe doit contenir au moins 8 caractères');
    return true;
  }),
  body('telephone').optional().isMobilePhone().withMessage('Numéro de téléphone invalide'),
];

const validateUpdate = [
  body('name').optional().trim().notEmpty(),
  body('nom').optional().trim().notEmpty(),
  body('email').optional().isEmail().withMessage('Email invalide'),
  body('telephone').optional().isMobilePhone().withMessage('Numéro de téléphone invalide'),
];

router.get('/clients', authenticate, requireSuperAdmin, list);
router.get('/clients/:id', authenticate, requireSuperAdmin, getById);
router.post('/clients', authenticate, requireSuperAdmin, validateCreate, create);
router.put('/clients/:id', authenticate, requireSuperAdmin, validateUpdate, update);
router.delete('/clients/:id', authenticate, requireSuperAdmin, remove);

module.exports = router;
