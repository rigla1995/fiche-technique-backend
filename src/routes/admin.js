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
    if (!pwd) return true;
    if (pwd.length < 8) throw new Error('Mot de passe : 8 caractères minimum');
    if (!/[A-Z]/.test(pwd)) throw new Error('Mot de passe : au moins une majuscule');
    if (!/[a-z]/.test(pwd)) throw new Error('Mot de passe : au moins une minuscule');
    if (!/[0-9]/.test(pwd)) throw new Error('Mot de passe : au moins un chiffre');
    if (!/[@$!%*?&_\-#]/.test(pwd)) throw new Error('Mot de passe : au moins un caractère spécial (@$!%*?&)');
    return true;
  }),
  body('phone').optional({ nullable: true, checkFalsy: false }).custom((val) => {
    if (!val) return true;
    if (!/^(\+216[\s-]?)?[2579]\d{7}$/.test(val.replace(/\s/g, ''))) {
      throw new Error('Numéro de téléphone tunisien invalide (ex: +216 XX XXX XXX)');
    }
    return true;
  }),
];

const validateUpdate = [
  body('name').optional().trim().notEmpty(),
  body('nom').optional().trim().notEmpty(),
  body('email').optional().isEmail().withMessage('Email invalide'),
  body('phone').optional({ nullable: true, checkFalsy: false }).custom((val) => {
    if (!val) return true;
    if (!/^(\+216[\s-]?)?[2579]\d{7}$/.test(val.replace(/\s/g, ''))) {
      throw new Error('Numéro de téléphone tunisien invalide (ex: +216 XX XXX XXX)');
    }
    return true;
  }),
];

router.get('/clients', authenticate, requireSuperAdmin, list);
router.get('/clients/:id', authenticate, requireSuperAdmin, getById);
router.post('/clients', authenticate, requireSuperAdmin, validateCreate, create);
router.put('/clients/:id', authenticate, requireSuperAdmin, validateUpdate, update);
router.delete('/clients/:id', authenticate, requireSuperAdmin, remove);

module.exports = router;
