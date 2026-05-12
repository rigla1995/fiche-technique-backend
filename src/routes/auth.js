const express = require('express');
const { body } = require('express-validator');
const router = express.Router();
const { login, register, me, updateProfile, upgradeToEntreprise, advanceOnboarding, completeUpgradeWizard, verifyInviteToken, acceptInvite, resendInvite } = require('../controllers/authController');
const { authenticate, requireSuperAdmin, requireClient } = require('../middleware/auth');
const pool = require('../config/database');

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

// GET /api/auth/check-email?email=X&excludeId=Y
// Returns { exists: boolean } — used for real-time uniqueness feedback in forms
router.get('/check-email', authenticate, async (req, res) => {
  const { email, excludeId } = req.query;
  if (!email) return res.json({ exists: false });
  const result = await pool.query(
    'SELECT 1 FROM utilisateurs WHERE LOWER(email) = LOWER($1)' + (excludeId ? ' AND id <> $2' : ''),
    excludeId ? [email, excludeId] : [email]
  );
  res.json({ exists: result.rows.length > 0 });
});

router.put('/profile', authenticate, [
  body('name').optional().trim().notEmpty().withMessage('Nom ne peut pas être vide'),
  body('email').optional().isEmail().withMessage('Format email invalide'),
  body('phone').optional({ nullable: true, checkFalsy: false }).custom((val) => {
    if (!val) return true;
    if (!/^(\+216[\s-]?)?[2579]\d{7}$/.test(val.replace(/\s/g, ''))) {
      throw new Error('Numéro de téléphone tunisien invalide (ex: +216 XX XXX XXX)');
    }
    return true;
  }),
  body('password').optional().custom((val) => {
    if (!val) return true;
    if (val.length < 8) throw new Error('Mot de passe : 8 caractères minimum');
    if (!/[A-Z]/.test(val)) throw new Error('Mot de passe : au moins une majuscule');
    if (!/[a-z]/.test(val)) throw new Error('Mot de passe : au moins une minuscule');
    if (!/[0-9]/.test(val)) throw new Error('Mot de passe : au moins un chiffre');
    if (!/[@$!%*?&_\-#]/.test(val)) throw new Error('Mot de passe : au moins un caractère spécial (@$!%*?&)');
    return true;
  }),
], updateProfile);

router.get('/invite/:token', verifyInviteToken);
router.post('/invite/accept', acceptInvite);
router.post('/invite/resend/:userId', authenticate, resendInvite);

router.post('/upgrade', authenticate, requireClient, upgradeToEntreprise);
router.post('/onboarding-step', authenticate, requireClient, advanceOnboarding);
router.post('/upgrade-wizard-complete', authenticate, requireClient, completeUpgradeWizard);

module.exports = router;
