const express = require('express');
const router = express.Router();
const {
  getEntreprise, upsertEntreprise,
  listActivites, createActivite, updateActivite, deleteActivite, duplicateActivite,
  hasActivites, getActiviteIngredients, toggleActiviteIngredient, updateIngredientPrice,
  getActiviteTypesSummary,
  getActiviteSelectedIngredients, getTypeSelectedIngredients,
  getCatalogueGlobalIngredients,
  getActivitesArticlesConsommables,
} = require('../controllers/entrepriseController');
const { listFournisseurs, getFournisseursForActivite, createFournisseur, updateFournisseur, deleteFournisseur } = require('../controllers/fournisseurController');
const { createPerte, listPertes, listEntreprisePertes, updateEntreprisePerte, deleteEntreprisePerte, exportEntreprisePertes, exportEntreprisePertesPdf, getPrixEntreprisePerte, getDateRangeEntreprisePerte } = require('../controllers/pertesController');
const { authenticate, requireEntreprise } = require('../middleware/auth');

/**
 * @openapi
 * /api/entreprise:
 *   get:
 *     tags: [Entreprise]
 *     summary: Récupérer le profil de l'entreprise
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Profil entreprise
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: integer
 *                 nom:
 *                   type: string
 *                 domaineId:
 *                   type: integer
 *       401:
 *         description: Non authentifié
 *       403:
 *         description: Accès réservé aux entreprises
 */
router.get('/', authenticate, requireEntreprise, getEntreprise);

/**
 * @openapi
 * /api/entreprise:
 *   put:
 *     tags: [Entreprise]
 *     summary: Créer ou mettre à jour le profil de l'entreprise
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               nom:
 *                 type: string
 *               domaineId:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Profil mis à jour
 *       401:
 *         description: Non authentifié
 *       403:
 *         description: Accès réservé aux entreprises
 */
router.put('/', authenticate, requireEntreprise, upsertEntreprise);

// Activities
router.get('/activites/has', authenticate, requireEntreprise, hasActivites);
router.get('/activites/types-summary', authenticate, requireEntreprise, getActiviteTypesSummary);
router.get('/activites/selected-ingredients', authenticate, requireEntreprise, getTypeSelectedIngredients);
// Articles consommables affectés à TOUTES les activités fournies (?activiteIds=1,2) — intersection. Refonte Espace Produits.
router.get('/activites/articles-consommables', authenticate, requireEntreprise, getActivitesArticlesConsommables);

/**
 * @openapi
 * /api/entreprise/catalogue-global-ingredients:
 *   get:
 *     tags: [Entreprise]
 *     summary: Récupérer le catalogue global d'ingrédients avec filtrage par domaine
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: domaineId
 *         schema:
 *           type: integer
 *         description: Filtrer par domaine
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Recherche textuelle
 *     responses:
 *       200:
 *         description: Liste d'ingrédients du catalogue
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: integer
 *                   nom:
 *                     type: string
 *                   unite:
 *                     type: string
 *       401:
 *         description: Non authentifié
 */
router.get('/catalogue-global-ingredients', authenticate, requireEntreprise, getCatalogueGlobalIngredients);

/**
 * @openapi
 * /api/entreprise/activites:
 *   get:
 *     tags: [Activites]
 *     summary: Lister les activités de l'entreprise
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Liste des activités
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: integer
 *                   nom:
 *                     type: string
 *                   type:
 *                     type: string
 *       401:
 *         description: Non authentifié
 */
router.get('/activites', authenticate, requireEntreprise, listActivites);

/**
 * @openapi
 * /api/entreprise/activites:
 *   post:
 *     tags: [Activites]
 *     summary: Créer une nouvelle activité
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [nom]
 *             properties:
 *               nom:
 *                 type: string
 *               type:
 *                 type: string
 *     responses:
 *       201:
 *         description: Activité créée
 *       400:
 *         description: Données invalides
 *       401:
 *         description: Non authentifié
 */
router.post('/activites', authenticate, requireEntreprise, createActivite);
/**
 * @openapi
 * /api/entreprise/activites/has:
 *   get:
 *     tags: [Activites]
 *     summary: Vérifier si l'entreprise possède au moins une activité
 *     responses:
 *       200:
 *         description: Résultat
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 has: { type: boolean }
 *
 * /api/entreprise/activites/types-summary:
 *   get:
 *     tags: [Activites]
 *     summary: Résumé des types d'activités de l'entreprise
 *     responses:
 *       200:
 *         description: Résumé par type
 *
 * /api/entreprise/activites/selected-ingredients:
 *   get:
 *     tags: [Activites]
 *     summary: Ingrédients sélectionnés par type d'activité
 *     responses:
 *       200:
 *         description: Ingrédients sélectionnés
 *
 * /api/entreprise/activites/{id}:
 *   put:
 *     tags: [Activites]
 *     summary: Modifier une activité
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               nom: { type: string }
 *               type: { type: string }
 *               adresse: { type: string, nullable: true }
 *               telephone: { type: string, nullable: true }
 *     responses:
 *       200:
 *         description: Activité mise à jour
 *       404:
 *         description: Activité introuvable
 *   delete:
 *     tags: [Activites]
 *     summary: Supprimer une activité
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Activité supprimée
 *
 * /api/entreprise/activites/{id}/duplicate:
 *   post:
 *     tags: [Activites]
 *     summary: Dupliquer une activité
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       201:
 *         description: Activité dupliquée
 */
router.put('/activites/:id', authenticate, requireEntreprise, updateActivite);
router.delete('/activites/:id', authenticate, requireEntreprise, deleteActivite);
router.post('/activites/:id/duplicate', authenticate, requireEntreprise, duplicateActivite);

/**
 * @openapi
 * /api/entreprise/activites/{id}/ingredients:
 *   get:
 *     tags: [Activites]
 *     summary: Récupérer les ingrédients d'une activité
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID de l'activité
 *     responses:
 *       200:
 *         description: Liste des ingrédients de l'activité
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: integer
 *                   nom:
 *                     type: string
 *                   selected:
 *                     type: boolean
 *                   prix:
 *                     type: number
 *       401:
 *         description: Non authentifié
 *       404:
 *         description: Activité introuvable
 */
router.get('/activites/:id/ingredients', authenticate, requireEntreprise, getActiviteIngredients);
/**
 * @openapi
 * /api/entreprise/activites/{id}/selected-ingredients:
 *   get:
 *     tags: [Activites]
 *     summary: Ingrédients sélectionnés pour une activité spécifique
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Liste des ingrédients sélectionnés
 *
 * /api/entreprise/activites/{id}/ingredients/{ingredientId}/select:
 *   post:
 *     tags: [Activites]
 *     summary: Sélectionner ou désélectionner un ingrédient pour une activité
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *       - in: path
 *         name: ingredientId
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               selected: { type: boolean }
 *     responses:
 *       200:
 *         description: Sélection mise à jour
 *
 * /api/entreprise/activites/{id}/ingredients/{ingredientId}/price:
 *   put:
 *     tags: [Activites]
 *     summary: Mettre à jour le prix d'un ingrédient pour une activité
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *       - in: path
 *         name: ingredientId
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               prix: { type: number }
 *     responses:
 *       200:
 *         description: Prix mis à jour
 *
 * /api/entreprise/fournisseurs:
 *   get:
 *     tags: [Fournisseurs]
 *     summary: Lister les fournisseurs de l'entreprise
 *     responses:
 *       200:
 *         description: Liste des fournisseurs
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Fournisseur'
 *   post:
 *     tags: [Fournisseurs]
 *     summary: Créer un fournisseur
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [nom]
 *             properties:
 *               nom: { type: string }
 *               adresse: { type: string, nullable: true }
 *               telephone: { type: string, nullable: true }
 *               activiteIds: { type: array, items: { type: integer } }
 *               laboIds: { type: array, items: { type: integer } }
 *     responses:
 *       201:
 *         description: Fournisseur créé
 *
 * /api/entreprise/fournisseurs/{id}:
 *   put:
 *     tags: [Fournisseurs]
 *     summary: Modifier un fournisseur
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               nom: { type: string }
 *               adresse: { type: string, nullable: true }
 *               telephone: { type: string, nullable: true }
 *               activiteIds: { type: array, items: { type: integer } }
 *               laboIds: { type: array, items: { type: integer } }
 *     responses:
 *       200:
 *         description: Fournisseur mis à jour
 *   delete:
 *     tags: [Fournisseurs]
 *     summary: Supprimer un fournisseur
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Fournisseur supprimé
 *
 * /api/entreprise/activites/{activiteId}/fournisseurs:
 *   get:
 *     tags: [Fournisseurs]
 *     summary: Lister les fournisseurs d'une activité spécifique
 *     parameters:
 *       - in: path
 *         name: activiteId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Fournisseurs de l'activité
 */
router.get('/activites/:id/selected-ingredients', authenticate, requireEntreprise, getActiviteSelectedIngredients);
router.post('/activites/:id/ingredients/:ingredientId/select', authenticate, requireEntreprise, toggleActiviteIngredient);
router.put('/activites/:id/ingredients/:ingredientId/price', authenticate, requireEntreprise, updateIngredientPrice);

// Fournisseurs
router.get('/fournisseurs', authenticate, requireEntreprise, listFournisseurs);
router.post('/fournisseurs', authenticate, requireEntreprise, createFournisseur);
router.put('/fournisseurs/:id', authenticate, requireEntreprise, updateFournisseur);
router.delete('/fournisseurs/:id', authenticate, requireEntreprise, deleteFournisseur);
router.get('/activites/:activiteId/fournisseurs', authenticate, requireEntreprise, getFournisseursForActivite);

/**
 * @openapi
 * /api/entreprise/activites/{activiteId}/pertes:
 *   post:
 *     tags: [Pertes]
 *     summary: Enregistrer une perte pour une activité
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: activiteId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID de l'activité
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [ingredientId, quantite]
 *             properties:
 *               ingredientId:
 *                 type: integer
 *               quantite:
 *                 type: number
 *               date:
 *                 type: string
 *                 format: date
 *               motif:
 *                 type: string
 *     responses:
 *       201:
 *         description: Perte enregistrée
 *       400:
 *         description: Données invalides
 *       401:
 *         description: Non authentifié
 */
router.post('/activites/:activiteId/pertes', authenticate, requireEntreprise, createPerte);
/**
 * @openapi
 * /api/entreprise/activites/{activiteId}/pertes:
 *   get:
 *     tags: [Pertes]
 *     summary: Lister les pertes d'une activité
 *     parameters:
 *       - in: path
 *         name: activiteId
 *         required: true
 *         schema: { type: integer }
 *       - in: query
 *         name: from
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: to
 *         schema: { type: string, format: date }
 *     responses:
 *       200:
 *         description: Liste des pertes
 *
 * /api/entreprise/pertes:
 *   get:
 *     tags: [Pertes]
 *     summary: Lister toutes les pertes de l'entreprise (toutes activités)
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
 *       200:
 *         description: Liste des pertes
 *
 * /api/entreprise/pertes/export-excel:
 *   get:
 *     tags: [Pertes]
 *     summary: Exporter les pertes en Excel
 *     responses:
 *       200:
 *         description: Fichier Excel
 *         content:
 *           application/vnd.openxmlformats-officedocument.spreadsheetml.sheet:
 *             schema:
 *               type: string
 *               format: binary
 *
 * /api/entreprise/pertes/export-pdf:
 *   get:
 *     tags: [Pertes]
 *     summary: Exporter les pertes en PDF
 *     responses:
 *       200:
 *         description: Fichier PDF
 *         content:
 *           application/pdf:
 *             schema:
 *               type: string
 *               format: binary
 *
 * /api/entreprise/pertes/prix:
 *   get:
 *     tags: [Pertes]
 *     summary: Récupérer les prix des ingrédients pour les pertes
 *     responses:
 *       200:
 *         description: Prix des ingrédients
 *
 * /api/entreprise/pertes/date-range:
 *   get:
 *     tags: [Pertes]
 *     summary: Plage de dates des pertes enregistrées
 *     responses:
 *       200:
 *         description: Date min et max
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 min: { type: string, format: date }
 *                 max: { type: string, format: date }
 *
 * /api/entreprise/pertes/{id}:
 *   put:
 *     tags: [Pertes]
 *     summary: Modifier une perte
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               quantite: { type: number }
 *               date: { type: string, format: date }
 *               motif: { type: string, nullable: true }
 *     responses:
 *       200:
 *         description: Perte mise à jour
 *   delete:
 *     tags: [Pertes]
 *     summary: Supprimer une perte
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Perte supprimée
 */
router.get('/activites/:activiteId/pertes', authenticate, requireEntreprise, listPertes);

// Pertes historique (all activités combined)
router.get('/pertes/export-excel', authenticate, requireEntreprise, exportEntreprisePertes);
router.get('/pertes/export-pdf', authenticate, requireEntreprise, exportEntreprisePertesPdf);
router.get('/pertes/prix', authenticate, requireEntreprise, getPrixEntreprisePerte);
router.get('/pertes/date-range', authenticate, requireEntreprise, getDateRangeEntreprisePerte);
router.get('/pertes', authenticate, requireEntreprise, listEntreprisePertes);
router.put('/pertes/:id', authenticate, requireEntreprise, updateEntreprisePerte);
router.delete('/pertes/:id', authenticate, requireEntreprise, deleteEntreprisePerte);

module.exports = router;
