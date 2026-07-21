const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const { authenticate, requireBoss } = require('../middleware/auth');
const {
  listAdmins, createAdmin, updateAdmin, deleteAdmin,
  listAnnuaire, requestReveal, verifyReveal,
} = require('../controllers/bossController');

// Bornage des révélations de mot de passe (2FA email).
const revealRequestLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 20,
  message: { message: 'Trop de demandes de code, réessayez plus tard.' },
  standardHeaders: true, legacyHeaders: false,
});
const revealVerifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 30,
  message: { message: 'Trop de tentatives, réessayez plus tard.' },
  standardHeaders: true, legacyHeaders: false,
});

// Toutes les routes Boss sont réservées au rôle boss.
router.use(authenticate, requireBoss);

// Gestion des comptes super_admin.
router.get('/admins', listAdmins);
router.post('/admins', createAdmin);
router.put('/admins/:id', updateAdmin);
router.delete('/admins/:id', deleteAdmin);

// Annuaire identifiants + révélation par code email.
router.get('/annuaire', listAnnuaire);
router.post('/reveal/request', revealRequestLimiter, requestReveal);
router.post('/reveal/verify', revealVerifyLimiter, verifyReveal);

module.exports = router;
