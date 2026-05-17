const express = require('express');
const router = express.Router();
const { authenticate, requireSuperAdmin, requireClient, requireClientOrGerant } = require('../middleware/auth');
const ab = require('../controllers/abonnementController');
const gerant = require('../controllers/gerantController');
const demande = require('../controllers/demandeController');
const support = require('../controllers/supportController');

// ── Tarifs (admin) ───────────────────────────────────────────────────────────
router.get('/tarifs', authenticate, requireSuperAdmin, ab.getTarifs);
router.put('/tarifs/:cle', authenticate, requireSuperAdmin, ab.updateTarif);

// ── Abonnements (admin) ──────────────────────────────────────────────────────
router.get('/', authenticate, requireSuperAdmin, ab.listAbonnements);
router.get('/client/:clientId', authenticate, requireSuperAdmin, ab.getAbonnement);
router.put('/client/:clientId/onboarding', authenticate, requireSuperAdmin, ab.updateOnboarding);
router.put('/client/:clientId/prolongation', authenticate, requireSuperAdmin, ab.updateProlongation);
router.put('/client/:clientId/mode', authenticate, requireSuperAdmin, ab.updateMode);
router.put('/client/:clientId/notes', authenticate, requireSuperAdmin, ab.updateNotes);
router.post('/client/:clientId/paiements', authenticate, requireSuperAdmin, ab.upsertPaiement);
router.get('/client/:clientId/montant-mois', authenticate, requireSuperAdmin, ab.getMontantMois);

// ── Promotions (admin) ───────────────────────────────────────────────────────
router.get('/client/:clientId/promotions', authenticate, requireSuperAdmin, ab.listPromotions);
router.post('/client/:clientId/promotions', authenticate, requireSuperAdmin, ab.createPromotion);
router.put('/promotions/:promoId', authenticate, requireSuperAdmin, ab.updatePromotion);
router.delete('/promotions/:promoId', authenticate, requireSuperAdmin, ab.deletePromotion);

// ── Abonnement config ────────────────────────────────────────────────────────
router.get('/client/:clientId/config', authenticate, requireSuperAdmin, ab.getAbonnementConfig);
router.put('/client/:clientId/config', authenticate, requireSuperAdmin, ab.updateAbonnementConfig);
router.get('/pricing-preview', authenticate, requireSuperAdmin, ab.getPricingPreview);

// ── Confirm invite & send email (admin) ──────────────────────────────────────
router.post('/client/:clientId/confirm-invite', authenticate, requireSuperAdmin, ab.confirmInvite);

// ── Global historique paiements & promotions (admin) ─────────────────────────
router.get('/all-paiements',  authenticate, requireSuperAdmin, ab.allPaiements);
router.get('/all-promotions', authenticate, requireSuperAdmin, ab.allPromotions);

// ── Admin data fix ────────────────────────────────────────────────────────────
router.post('/admin/sync-promo-statuts', authenticate, requireSuperAdmin, ab.runSyncPromoStatuts);

// ── Mon abonnement (client self) ─────────────────────────────────────────────
router.get('/mon-abonnement', authenticate, requireClient, async (req, res) => {
  req.params.clientId = String(req.user.id);
  req.query.withPricing = '1';
  return ab.getAbonnement(req, res);
});

// ── Supplement pricing (client self) ─────────────────────────────────────────
router.get('/supplement-pricing', authenticate, requireClient, ab.getSupplementPricing);

// ── Supplement pricing for a specific client (admin) ─────────────────────────
router.get('/client/:clientId/supplement-pricing', authenticate, requireSuperAdmin, ab.getClientSupplementPricing);

// ── Gérants ──────────────────────────────────────────────────────────────────
router.get('/gerants', authenticate, requireClient, gerant.list);
router.post('/gerants', authenticate, requireClient, gerant.create);
router.put('/gerants/:id', authenticate, requireClient, gerant.update);
router.delete('/gerants/:id', authenticate, requireClient, gerant.remove);

// ── Demandes (upgrade) ────────────────────────────────────────────────────────
router.get('/demandes', authenticate, requireClient, demande.listMine);
router.post('/demandes', authenticate, requireClient, demande.create);
router.get('/admin/demandes', authenticate, requireSuperAdmin, demande.listAll);
router.put('/admin/demandes/:id', authenticate, requireSuperAdmin, demande.traiter);

// ── Support ───────────────────────────────────────────────────────────────────
router.get('/support', authenticate, requireClient, support.listMine);
router.post('/support', authenticate, requireClient, support.create);
router.delete('/support/:id', authenticate, requireClient, support.deleteMine);
router.get('/admin/support', authenticate, requireSuperAdmin, support.listAll);
router.get('/admin/support/:id/avenant-preview', authenticate, requireSuperAdmin, support.previewAvenant);
router.put('/admin/support/:id', authenticate, requireSuperAdmin, support.traiter);

module.exports = router;
