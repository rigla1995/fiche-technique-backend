const express = require('express');
const { body } = require('express-validator');
const router = express.Router();
const { login, register, me } = require('../controllers/authController');
const { authenticate, requireSuperAdmin } = require('../middleware/auth');

router.post('/login', [
  body('email').isEmail().withMessage('Email invalide'),
  body('mot_de_passe').optional(),
  body('password').optional(),
  body().custom((body) => {
    if (!body.mot_de_passe && !body.password) {
      throw new Error('Mot de passe requis');
    }
    return true;
  }),
], login);

router.post('/register', authenticate, requireSuperAdmin, [
  body('nom').trim().notEmpty().withMessage('Nom requis'),
  body('email').isEmail().withMessage('Email invalide'),
  body('mot_de_passe').isLength({ min: 8 }).withMessage('Mot de passe doit contenir au moins 8 caractères'),
  body('telephone').optional().isMobilePhone().withMessage('Numéro de téléphone invalide'),
], register);

router.get('/me', authenticate, me);

module.exports = router;
