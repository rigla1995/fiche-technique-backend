const express = require('express');
const { body } = require('express-validator');
const router = express.Router();
const { list, getById, create, update, remove, toggleSelection, hasSelections } = require('../controllers/ingredientsController');
const { authenticate, requireSuperAdmin, requireClient } = require('../middleware/auth');

const validateCreate = [
  body().custom((b) => {
    if (!b.name && !b.nom) throw new Error('Nom requis');
    return true;
  }),
  body().custom((b) => {
    const uniteId = b.unitId || b.unite_id;
    if (!uniteId || parseInt(uniteId) < 1) throw new Error('Unité invalide');
    return true;
  }),
  body().custom((b) => {
    const prix = b.price !== undefined ? b.price : b.prix;
    if (prix !== undefined && prix !== null && parseFloat(prix) < 0) throw new Error('Prix invalide (doit être >= 0)');
    return true;
  }),
];

/**
 * @openapi
 * /api/ingredients:
 *   get:
 *     tags: [Ingrédients]
 *     summary: Lister tous les ingrédients du catalogue global
 *     responses:
 *       200:
 *         description: Liste des ingrédients
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Ingredient'
 *   post:
 *     tags: [Ingrédients]
 *     summary: Créer un ingrédient
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, unitId]
 *             properties:
 *               name: { type: string, example: Farine }
 *               unitId: { type: integer, example: 1 }
 *               price: { type: number, format: float, example: 1.5 }
 *               categorieId: { type: integer, nullable: true }
 *     responses:
 *       201:
 *         description: Ingrédient créé
 *       400:
 *         description: Données invalides
 *
 * /api/ingredients/has-selections:
 *   get:
 *     tags: [Ingrédients]
 *     summary: Vérifier si l'entreprise a des sélections d'ingrédients
 *     responses:
 *       200:
 *         description: Résultat de la vérification
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 hasSelections: { type: boolean }
 *
 * /api/ingredients/{id}:
 *   get:
 *     tags: [Ingrédients]
 *     summary: Récupérer un ingrédient par ID
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Ingrédient trouvé
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Ingredient'
 *       404:
 *         description: Ingrédient introuvable
 *   put:
 *     tags: [Ingrédients]
 *     summary: Modifier un ingrédient
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
 *               price: { type: number, format: float }
 *               unitId: { type: integer }
 *               categorieId: { type: integer, nullable: true }
 *     responses:
 *       200:
 *         description: Ingrédient mis à jour
 *   delete:
 *     tags: [Ingrédients]
 *     summary: Supprimer un ingrédient
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Ingrédient supprimé
 *       409:
 *         description: Ingrédient utilisé dans des fiches techniques
 *
 * /api/ingredients/{id}/select:
 *   post:
 *     tags: [Ingrédients]
 *     summary: Sélectionner / désélectionner un ingrédient pour l'activité courante
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
 *               activiteId: { type: integer }
 *               laboId: { type: integer }
 *               selected: { type: boolean }
 *     responses:
 *       200:
 *         description: Sélection mise à jour
 */
router.get('/', authenticate, list);
router.get('/has-selections', authenticate, requireClient, hasSelections);
router.get('/:id', authenticate, getById);
router.post('/', authenticate, validateCreate, create);
router.put('/:id', authenticate, [
  body('name').optional().trim().notEmpty(),
  body('nom').optional().trim().notEmpty(),
  body('price').optional({ nullable: true }).isFloat({ min: 0 }),
  body('prix').optional({ nullable: true }).isFloat({ min: 0 }),
  body('unitId').optional().isInt({ min: 1 }),
  body('unite_id').optional().isInt({ min: 1 }),
  body('categorieId').optional({ nullable: true }).isInt({ min: 1 }),
  body('categorie_id').optional({ nullable: true }).isInt({ min: 1 }),
], update);
router.delete('/:id', authenticate, remove);
router.post('/:id/select', authenticate, requireClient, toggleSelection);

module.exports = router;
