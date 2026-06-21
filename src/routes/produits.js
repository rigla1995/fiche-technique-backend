const express = require('express');
const { body } = require('express-validator');
const router = express.Router();
const {
  list, getById, create, update, remove,
  addIngredient, removeIngredient,
  addSousProduit, removeSousProduit,
  getCout, getStockDates, getStockCheck, getManualPrices, saveManualPrices,
  exportListExcel,
} = require('../controllers/produitsController');
const { exportExcel } = require('../controllers/exportController');
const { authenticate, requireClient } = require('../middleware/auth');

/**
 * @openapi
 * /api/produits:
 *   get:
 *     tags: [Produits]
 *     summary: Lister les fiches techniques (produits)
 *     parameters:
 *       - in: query
 *         name: activiteId
 *         schema: { type: integer }
 *       - in: query
 *         name: type
 *         schema: { type: string, enum: [utilisable, vendable] }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Liste des fiches techniques
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id: { type: integer }
 *                   nom: { type: string }
 *                   type: { type: string, enum: [utilisable, vendable] }
 *                   familleId: { type: integer, nullable: true }
 *                   coutTotal: { type: number, nullable: true }
 *   post:
 *     tags: [Produits]
 *     summary: Créer une fiche technique
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name: { type: string, example: Tajine agneau }
 *               type: { type: string, enum: [utilisable, vendable], default: utilisable }
 *               familleId: { type: integer, nullable: true }
 *               prixVente: { type: number, nullable: true }
 *     responses:
 *       201:
 *         description: Fiche technique créée
 *
 * /api/produits/export-list:
 *   get:
 *     tags: [Produits]
 *     summary: Exporter la liste des fiches techniques en Excel
 *     responses:
 *       200:
 *         description: Fichier Excel
 *         content:
 *           application/vnd.openxmlformats-officedocument.spreadsheetml.sheet:
 *             schema:
 *               type: string
 *               format: binary
 *
 * /api/produits/{id}:
 *   get:
 *     tags: [Produits]
 *     summary: Récupérer une fiche technique par ID
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Fiche technique avec composition
 *       404:
 *         description: Fiche introuvable
 *   put:
 *     tags: [Produits]
 *     summary: Modifier une fiche technique
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
 *               name: { type: string }
 *               type: { type: string, enum: [utilisable, vendable] }
 *               familleId: { type: integer, nullable: true }
 *               prixVente: { type: number, nullable: true }
 *     responses:
 *       200:
 *         description: Fiche mise à jour
 *   delete:
 *     tags: [Produits]
 *     summary: Supprimer une fiche technique
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Fiche supprimée
 *
 * /api/produits/{id}/ingredients:
 *   post:
 *     tags: [Produits]
 *     summary: Ajouter un ingrédient à la composition de la fiche
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [ingredientId, portion, unitId]
 *             properties:
 *               ingredientId: { type: integer }
 *               portion: { type: number, format: float, minimum: 0.001 }
 *               unitId: { type: integer }
 *     responses:
 *       200:
 *         description: Ingrédient ajouté
 *
 * /api/produits/{id}/ingredients/{ingredientId}:
 *   delete:
 *     tags: [Produits]
 *     summary: Retirer un ingrédient de la composition
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *       - in: path
 *         name: ingredientId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Ingrédient retiré
 *
 * /api/produits/{id}/sous-produits:
 *   post:
 *     tags: [Produits]
 *     summary: Ajouter un sous-produit (semi-fini) à la composition
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [productId, portion]
 *             properties:
 *               productId: { type: integer }
 *               portion: { type: number, format: float, minimum: 0.001 }
 *     responses:
 *       200:
 *         description: Sous-produit ajouté
 *
 * /api/produits/{id}/sous-produits/{sousProduitId}:
 *   delete:
 *     tags: [Produits]
 *     summary: Retirer un sous-produit de la composition
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *       - in: path
 *         name: sousProduitId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Sous-produit retiré
 *
 * /api/produits/{id}/cout:
 *   get:
 *     tags: [Produits]
 *     summary: Calculer le coût de revient de la fiche technique
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *       - in: query
 *         name: activiteId
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Coût calculé
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 coutTotal: { type: number }
 *                 marge: { type: number, nullable: true }
 *                 ingredients: { type: array }
 *
 * /api/produits/{id}/export:
 *   get:
 *     tags: [Produits]
 *     summary: Exporter la fiche technique en Excel
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Fichier Excel de la fiche
 *         content:
 *           application/vnd.openxmlformats-officedocument.spreadsheetml.sheet:
 *             schema:
 *               type: string
 *               format: binary
 *
 * /api/produits/{id}/stock-dates:
 *   get:
 *     tags: [Produits]
 *     summary: Dates de valorisation du stock pour la fiche
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Dates disponibles
 *
 * /api/produits/{id}/stock-check:
 *   get:
 *     tags: [Produits]
 *     summary: Vérifier la disponibilité en stock pour fabriquer la fiche
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *       - in: query
 *         name: activiteId
 *         schema: { type: integer }
 *       - in: query
 *         name: portions
 *         schema: { type: integer, default: 1 }
 *     responses:
 *       200:
 *         description: Résultat du stock check
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok: { type: boolean }
 *                 manquants: { type: array }
 *
 * /api/produits/{id}/manual-prices:
 *   get:
 *     tags: [Produits]
 *     summary: Récupérer les prix manuels des ingrédients de la fiche
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Prix manuels
 *   post:
 *     tags: [Produits]
 *     summary: Sauvegarder les prix manuels pour la fiche
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
 *               prices:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     ingredientId: { type: integer }
 *                     prix: { type: number }
 *     responses:
 *       200:
 *         description: Prix sauvegardés
 *
 * /api/produits/{id}/stock-activites:
 *   get:
 *     tags: [Produits]
 *     summary: Récupérer les activités affectées au stock du produit transformé
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Activités affectées
 *
 * /api/produits/{id}/toggle-stock-ingredient:
 *   post:
 *     tags: [Produits]
 *     summary: Activer/désactiver le suivi stock d'un ingrédient de la fiche
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
 *               ingredientId: { type: integer }
 *               active: { type: boolean }
 *     responses:
 *       200:
 *         description: Suivi mis à jour
 *
 * /api/produits/{id}/stock-pt-history:
 *   delete:
 *     tags: [Produits]
 *     summary: Vider l'historique stock du produit transformé
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Historique effacé
 *
 * /api/produits/{id}/affecter-activites:
 *   post:
 *     tags: [Produits]
 *     summary: Affecter le produit transformé à des activités
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
 *               activiteIds: { type: array, items: { type: integer } }
 *     responses:
 *       200:
 *         description: Affectations mises à jour
 */
router.get('/', authenticate, requireClient, list);
router.get('/export-list', authenticate, requireClient, exportListExcel);
router.get('/:id', authenticate, requireClient, getById);
router.post('/', authenticate, requireClient, [
  body().custom((b) => {
    if (!b.name && !b.nom) throw new Error('Nom requis');
    return true;
  }),
  body('type').optional().isIn(['utilisable', 'vendable']),
  body('categorieProduitId').optional({ nullable: true }).isInt({ min: 1 }),
], create);
router.put('/:id', authenticate, requireClient, [
  body('name').optional().trim().notEmpty(),
  body('nom').optional().trim().notEmpty(),
  body('type').optional().isIn(['utilisable', 'vendable']),
  body('categorieProduitId').optional({ nullable: true }).isInt({ min: 1 }),
], update);
router.delete('/:id', authenticate, requireClient, remove);

router.post('/:id/ingredients', authenticate, requireClient, [
  body().custom((b) => {
    const id = b.ingredientId || b.ingredient_id;
    if (!id || parseInt(id) < 1) throw new Error('Ingrédient invalide');
    return true;
  }),
  body('portion').isFloat({ min: 0.001 }).withMessage('Portion invalide'),
  body().custom((b) => {
    const id = b.unitId || b.unite_id;
    if (!id || parseInt(id) < 1) throw new Error('Unité invalide');
    return true;
  }),
], addIngredient);
router.delete('/:id/ingredients/:ingredientId', authenticate, requireClient, removeIngredient);

router.post('/:id/sous-produits', authenticate, requireClient, [
  body().custom((b) => {
    const id = b.productId || b.produit_id;
    if (!id || parseInt(id) < 1) throw new Error('Sous-produit invalide');
    return true;
  }),
  body('portion').isFloat({ min: 0.001 }).withMessage('Portion invalide'),
], addSousProduit);
router.delete('/:id/sous-produits/:sousProduitId', authenticate, requireClient, removeSousProduit);

router.get('/:id/cout', authenticate, requireClient, getCout);
router.get('/:id/export', authenticate, requireClient, exportExcel);
router.get('/:id/stock-dates', authenticate, requireClient, getStockDates);
router.get('/:id/stock-check', authenticate, requireClient, getStockCheck);
router.get('/:id/manual-prices', authenticate, requireClient, getManualPrices);
router.post('/:id/manual-prices', authenticate, requireClient, saveManualPrices);

const { toggleStockIngredient, deleteStockPTHistory, getStockActivites, affecterActivites, toggleAffectation, getParentProducts } = require('../controllers/produitTransformeController');
router.get('/:id/stock-activites', authenticate, requireClient, getStockActivites);
router.post('/:id/toggle-stock-ingredient', authenticate, requireClient, toggleStockIngredient);
router.delete('/:id/stock-pt-history', authenticate, requireClient, deleteStockPTHistory);
router.post('/:id/affecter-activites', authenticate, requireClient, affecterActivites);
router.post('/:id/toggle-affectation', authenticate, requireClient, toggleAffectation);
router.get('/:id/parent-products', authenticate, requireClient, getParentProducts);

module.exports = router;
