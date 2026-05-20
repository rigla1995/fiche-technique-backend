const express = require('express');
const router = express.Router();
const { authenticate, requireSuperAdmin, requireEntreprise } = require('../middleware/auth');
const c = require('../controllers/ventesController');

// ── Admin routes ─────────────────────────────────────────────────────────────
router.get('/admin/prestataires', authenticate, requireSuperAdmin, c.listPrestataires);
router.post('/admin/prestataires', authenticate, requireSuperAdmin, c.createPrestataire);
router.put('/admin/prestataires/:id', authenticate, requireSuperAdmin, c.updatePrestataire);
router.delete('/admin/prestataires/:id', authenticate, requireSuperAdmin, c.deletePrestataire);
router.put('/admin/entreprises/:entrepriseId/module-vente', authenticate, requireSuperAdmin, c.toggleModuleVente);

// ── Client — Prestataires par activité ───────────────────────────────────────
router.get('/prestataires', authenticate, requireEntreprise, c.listPrestatairesClient);
router.get('/activite-prestataires', authenticate, requireEntreprise, c.listActivitePrestataires);
router.post('/activite-prestataires', authenticate, requireEntreprise, c.addActivitePrestataire);
router.put('/activite-prestataires/:id', authenticate, requireEntreprise, c.updateActivitePrestataire);
router.delete('/activite-prestataires/:id', authenticate, requireEntreprise, c.removeActivitePrestataire);

// ── Articles vendables ────────────────────────────────────────────────────────
router.get('/articles-vendables', authenticate, requireEntreprise, c.listArticlesVendables);
router.post('/articles-vendables', authenticate, requireEntreprise, c.upsertArticleVendable);
router.put('/articles-vendables/:id', authenticate, requireEntreprise, c.updateArticleVendable);
router.delete('/articles-vendables/:id', authenticate, requireEntreprise, c.deleteArticleVendable);

// ── Prix prestataire par article ──────────────────────────────────────────────
router.get('/article-prix-prestataire', authenticate, requireEntreprise, c.listArticlePrixPrestataire);
router.post('/article-prix-prestataire', authenticate, requireEntreprise, c.upsertArticlePrixPrestataire);

// ── Charges fixes ─────────────────────────────────────────────────────────────
router.get('/charges-fixes', authenticate, requireEntreprise, c.getChargesFixes);
router.post('/charges-fixes', authenticate, requireEntreprise, c.upsertChargesFixes);

// ── Ventes activité ───────────────────────────────────────────────────────────
router.get('/ventes', authenticate, requireEntreprise, c.listVentes);
router.get('/ventes/stats', authenticate, requireEntreprise, c.statsVentes);
router.get('/ventes/:id', authenticate, requireEntreprise, c.getVente);
router.post('/ventes', authenticate, requireEntreprise, c.createVente);
router.delete('/ventes/:id', authenticate, requireEntreprise, c.annulerVente);

// ── Labo ventes ───────────────────────────────────────────────────────────────
router.get('/labo-ventes', authenticate, requireEntreprise, c.laboVentes);
router.get('/labo-ventes/stats', authenticate, requireEntreprise, c.laboVentesStats);

module.exports = router;
