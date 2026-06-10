const express = require('express');
const { body } = require('express-validator');
const router = express.Router();
const { list, getById, create, update, remove } = require('../controllers/famillesController');
const { authenticate, requireClient } = require('../middleware/auth');

const validateBody = [
  body().custom((b) => {
    if (!b.name && !b.nom) throw new Error('Nom requis');
    return true;
  }),
];

/**
 * @openapi
 * /api/familles:
 *   get:
 *     tags: [Référentiel]
 *     summary: Lister les familles de produits
 *     responses:
 *       200:
 *         description: Liste des familles
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
 *     summary: Créer une famille de produits
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name: { type: string, example: Boissons }
 *     responses:
 *       201:
 *         description: Famille créée
 *
 * /api/familles/{id}:
 *   get:
 *     tags: [Référentiel]
 *     summary: Récupérer une famille par ID
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Famille trouvée
 *       404:
 *         description: Famille introuvable
 *   put:
 *     tags: [Référentiel]
 *     summary: Modifier une famille
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
 *         description: Famille mise à jour
 *   delete:
 *     tags: [Référentiel]
 *     summary: Supprimer une famille
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Famille supprimée
 */
router.get('/', authenticate, requireClient, list);
router.get('/:id', authenticate, requireClient, getById);
router.post('/', authenticate, requireClient, validateBody, create);
router.put('/:id', authenticate, requireClient, validateBody, update);
router.delete('/:id', authenticate, requireClient, remove);

module.exports = router;
