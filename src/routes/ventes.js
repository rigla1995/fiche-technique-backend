const express = require('express');
const router = express.Router();
const { authenticate, requireSuperAdmin, requireEntreprise } = require('../middleware/auth');
const c = require('../controllers/ventesController');

// ── Admin routes ─────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/admin/prestataires:
 *   get:
 *     tags: [Ventes]
 *     summary: Liste tous les prestataires de livraison (admin)
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Liste des prestataires }
 *   post:
 *     tags: [Ventes]
 *     summary: Créer un prestataire de livraison (admin)
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [nom]
 *             properties:
 *               nom: { type: string }
 *               telephone: { type: string }
 *               email: { type: string }
 *     responses:
 *       201: { description: Prestataire créé }
 */
router.get('/admin/prestataires', authenticate, requireSuperAdmin, c.listPrestataires);
router.post('/admin/prestataires', authenticate, requireSuperAdmin, c.createPrestataire);

/**
 * @swagger
 * /api/admin/prestataires/{id}:
 *   put:
 *     tags: [Ventes]
 *     summary: Modifier un prestataire (admin)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Prestataire modifié }
 *   delete:
 *     tags: [Ventes]
 *     summary: Supprimer un prestataire (admin)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       204: { description: Supprimé }
 */
router.put('/admin/prestataires/:id', authenticate, requireSuperAdmin, c.updatePrestataire);
router.delete('/admin/prestataires/:id', authenticate, requireSuperAdmin, c.deletePrestataire);

/**
 * @swagger
 * /api/admin/entreprises/{entrepriseId}/module-vente:
 *   put:
 *     tags: [Ventes]
 *     summary: Activer / désactiver le module vente pour une entreprise (admin — legacy, préférer /api/abonnements/client/:clientId/module-vente)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: entrepriseId
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               actif: { type: boolean }
 *     responses:
 *       200: { description: Statut mis à jour }
 */
router.put('/admin/entreprises/:entrepriseId/module-vente', authenticate, requireSuperAdmin, c.toggleModuleVente);

// ── Client — Prestataires par activité ───────────────────────────────────────

/**
 * @swagger
 * /api/prestataires:
 *   get:
 *     tags: [Ventes]
 *     summary: Liste les prestataires disponibles pour l'activité (client)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: activiteId
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Liste des prestataires }
 */
router.get('/prestataires', authenticate, requireEntreprise, c.listPrestatairesClient);

/**
 * @swagger
 * /api/activite-prestataires:
 *   get:
 *     tags: [Ventes]
 *     summary: Liste les liens activité–prestataire pour l'activité (client)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: activiteId
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Liste des liens }
 *   post:
 *     tags: [Ventes]
 *     summary: Ajouter un prestataire à une activité
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       201: { description: Lien créé }
 */
router.get('/activite-prestataires', authenticate, requireEntreprise, c.listActivitePrestataires);
router.post('/activite-prestataires', authenticate, requireEntreprise, c.addActivitePrestataire);

/**
 * @swagger
 * /api/activite-prestataires/{id}:
 *   put:
 *     tags: [Ventes]
 *     summary: Modifier taux_commission ou actif d'un lien activité-prestataire
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Lien modifié }
 *   delete:
 *     tags: [Ventes]
 *     summary: Supprimer un lien activité-prestataire
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       204: { description: Supprimé }
 */
router.put('/activite-prestataires/:id', authenticate, requireEntreprise, c.updateActivitePrestataire);
router.delete('/activite-prestataires/:id', authenticate, requireEntreprise, c.removeActivitePrestataire);

// ── Articles vendables ────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/articles-vendables:
 *   get:
 *     tags: [Ventes]
 *     summary: Liste les articles vendables de l'activité
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: activiteId
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Liste des articles }
 *   post:
 *     tags: [Ventes]
 *     summary: Créer ou mettre à jour un article vendable (upsert par ingredient_id + activite_id)
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Article upserted }
 */
router.get('/articles-vendables', authenticate, requireEntreprise, c.listArticlesVendables);
router.get('/articles-vendables/historique-config', authenticate, requireEntreprise, c.getPrixHistoriqueConfig);
router.get('/articles-vendables/historique-config/export-excel', authenticate, requireEntreprise, c.exportPrixHistoriqueConfigExcel);
router.post('/articles-vendables', authenticate, requireEntreprise, c.upsertArticleVendable);

/**
 * @swagger
 * /api/articles-vendables/{id}:
 *   put:
 *     tags: [Ventes]
 *     summary: Modifier un article vendable (prix, portion, actif)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Article modifié }
 *   delete:
 *     tags: [Ventes]
 *     summary: Supprimer un article vendable
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       204: { description: Supprimé }
 */
router.put('/articles-vendables/:id', authenticate, requireEntreprise, c.updateArticleVendable);
router.get('/articles-vendables/:id/historique', authenticate, requireEntreprise, c.getPrixHistorique);
router.delete('/articles-vendables/:id', authenticate, requireEntreprise, c.deleteArticleVendable);
router.delete('/articles-vendables/historique/:id', authenticate, requireEntreprise, c.deleteHistoriqueEntry);

// ── Prix prestataire par article ──────────────────────────────────────────────

/**
 * @swagger
 * /api/article-prix-prestataire:
 *   get:
 *     tags: [Ventes]
 *     summary: Liste les prix par prestataire pour les articles vendables
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: activiteId
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Liste des prix }
 *   post:
 *     tags: [Ventes]
 *     summary: Upsert un prix article × prestataire
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Prix enregistré }
 */
router.get('/article-prix-prestataire', authenticate, requireEntreprise, c.listArticlePrixPrestataire);
router.post('/article-prix-prestataire', authenticate, requireEntreprise, c.upsertArticlePrixPrestataire);

// ── Charges fixes ─────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/charges-fixes:
 *   get:
 *     tags: [Ventes]
 *     summary: Récupérer les charges fixes d'une activité
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: activiteId
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Charges fixes }
 *   post:
 *     tags: [Ventes]
 *     summary: Enregistrer les charges fixes d'une activité
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Charges enregistrées }
 */
router.get('/charges-fixes', authenticate, requireEntreprise, c.getChargesFixes);
router.post('/charges-fixes', authenticate, requireEntreprise, c.upsertChargesFixes);

// ── Ventes activité ───────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/ventes:
 *   get:
 *     tags: [Ventes]
 *     summary: Liste les ventes d'une activité
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: activiteId
 *         schema: { type: integer }
 *       - in: query
 *         name: from
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: to
 *         schema: { type: string, format: date }
 *     responses:
 *       200: { description: Liste des ventes }
 *   post:
 *     tags: [Ventes]
 *     summary: Enregistrer une vente
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       201: { description: Vente créée }
 */
router.get('/ventes', authenticate, requireEntreprise, c.listVentes);
router.get('/ventes/export-excel', authenticate, requireEntreprise, c.exportVentesExcel);
router.post('/ventes', authenticate, requireEntreprise, c.createVente);

/**
 * @swagger
 * /api/ventes/stats:
 *   get:
 *     tags: [Ventes]
 *     summary: Statistiques ventes (CA jour/semaine/mois, top articles, répartition)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: activiteId
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Statistiques }
 */
router.get('/ventes/stats', authenticate, requireEntreprise, c.statsVentes);

/**
 * @swagger
 * /api/ventes/{id}:
 *   get:
 *     tags: [Ventes]
 *     summary: Détail d'une vente
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Vente }
 *   delete:
 *     tags: [Ventes]
 *     summary: Annuler une vente
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Vente annulée }
 */
router.get('/ventes/:id', authenticate, requireEntreprise, c.getVente);
router.delete('/ventes/:id', authenticate, requireEntreprise, c.annulerVente);

// ── Labo ventes ───────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/labo-ventes:
 *   get:
 *     tags: [Ventes]
 *     summary: Transferts valorisés du labo vers les activités
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: laboId
 *         required: true
 *         schema: { type: integer }
 *       - in: query
 *         name: from
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: to
 *         schema: { type: string, format: date }
 *     responses:
 *       200: { description: Liste des lignes valorisées }
 */
router.get('/labo-ventes', authenticate, requireEntreprise, c.laboVentes);

/**
 * @swagger
 * /api/labo-ventes/stats:
 *   get:
 *     tags: [Ventes]
 *     summary: Statistiques des transferts valorisés du labo
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: laboId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Statistiques }
 */
router.get('/labo-ventes/stats', authenticate, requireEntreprise, c.laboVentesStats);

module.exports = router;
