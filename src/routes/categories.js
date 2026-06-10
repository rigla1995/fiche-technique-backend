const express = require('express');
const { body } = require('express-validator');
const router = express.Router();
const { list, getById, create, update, remove } = require('../controllers/categoriesController');
const { authenticate, requireClient } = require('../middleware/auth');

const validateNom = [
  body().custom((b) => {
    if (!b.name && !b.nom) throw new Error('Nom requis');
    return true;
  }),
];

const validateUpdate = [
  body('name').optional().trim().notEmpty(),
  body('nom').optional().trim().notEmpty(),
];

/**
 * @openapi
 * /api/categories:
 *   get:
 *     tags: [Référentiel]
 *     summary: Lister les catégories d'ingrédients
 *     responses:
 *       200:
 *         description: Liste des catégories
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id: { type: integer }
 *                   name: { type: string }
 *   post:
 *     tags: [Référentiel]
 *     summary: Créer une catégorie
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name: { type: string, example: Épices }
 *     responses:
 *       201:
 *         description: Catégorie créée
 *       400:
 *         description: Nom requis
 */
router.get('/', authenticate, requireClient, list);

/**
 * @openapi
 * /api/categories/{id}:
 *   get:
 *     tags: [Référentiel]
 *     summary: Récupérer une catégorie par ID
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Catégorie trouvée
 *       404:
 *         description: Catégorie introuvable
 *   put:
 *     tags: [Référentiel]
 *     summary: Modifier une catégorie
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
 *     responses:
 *       200:
 *         description: Catégorie mise à jour
 *   delete:
 *     tags: [Référentiel]
 *     summary: Supprimer une catégorie
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Catégorie supprimée
 *       409:
 *         description: Catégorie utilisée
 */
router.get('/:id', authenticate, requireClient, getById);
router.post('/', authenticate, requireClient, validateNom, create);
router.put('/:id', authenticate, requireClient, validateUpdate, update);
router.delete('/:id', authenticate, requireClient, remove);

module.exports = router;
