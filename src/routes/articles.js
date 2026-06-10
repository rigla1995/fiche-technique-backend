const express = require('express');
const { body } = require('express-validator');
const router = express.Router();
const { list, getById, create, update, remove, hasArticles } = require('../controllers/articlesController');
const { authenticate, requireClient } = require('../middleware/auth');

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
];

/**
 * @openapi
 * /api/articles:
 *   get:
 *     tags: [Référentiel]
 *     summary: Lister les articles du référentiel client
 *     responses:
 *       200:
 *         description: Liste des articles
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id: { type: integer }
 *                   name: { type: string }
 *                   unitId: { type: integer }
 *                   categorieId: { type: integer, nullable: true }
 *   post:
 *     tags: [Référentiel]
 *     summary: Créer un article dans le référentiel
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, unitId]
 *             properties:
 *               name: { type: string, example: Farine de blé }
 *               unitId: { type: integer, example: 1 }
 *               categorieId: { type: integer, nullable: true }
 *     responses:
 *       201:
 *         description: Article créé
 *       400:
 *         description: Données invalides
 *
 * /api/articles/has-articles:
 *   get:
 *     tags: [Référentiel]
 *     summary: Vérifier si le client a des articles dans le référentiel
 *     responses:
 *       200:
 *         description: Résultat
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 hasArticles: { type: boolean }
 *
 * /api/articles/{id}:
 *   get:
 *     tags: [Référentiel]
 *     summary: Récupérer un article par ID
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Article trouvé
 *       404:
 *         description: Article introuvable
 *   put:
 *     tags: [Référentiel]
 *     summary: Modifier un article
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
 *               unitId: { type: integer }
 *               categorieId: { type: integer, nullable: true }
 *     responses:
 *       200:
 *         description: Article mis à jour
 *   delete:
 *     tags: [Référentiel]
 *     summary: Supprimer un article du référentiel
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Article supprimé
 */
router.get('/', authenticate, requireClient, list);
router.get('/has-articles', authenticate, requireClient, hasArticles);
router.get('/:id', authenticate, requireClient, getById);
router.post('/', authenticate, requireClient, validateCreate, create);
router.put('/:id', authenticate, requireClient, [
  body('name').optional().trim().notEmpty(),
  body('nom').optional().trim().notEmpty(),
  body('unitId').optional().isInt({ min: 1 }),
  body('unite_id').optional().isInt({ min: 1 }),
  body('categorieId').optional({ nullable: true }).isInt({ min: 1 }),
], update);
router.delete('/:id', authenticate, requireClient, remove);

module.exports = router;
