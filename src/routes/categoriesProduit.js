const express = require('express');
const { body } = require('express-validator');
const router = express.Router();
const { list, getById, create, update, remove } = require('../controllers/categoriesProduitController');
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
 * /api/categories-produit:
 *   get:
 *     tags: [Référentiel]
 *     summary: Lister les catégories de produit du client
 *     responses:
 *       200: { description: Liste des catégories de produit }
 *   post:
 *     tags: [Référentiel]
 *     summary: Créer une catégorie de produit
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
 *       201: { description: Catégorie créée }
 *       400: { description: Nom requis }
 *       409: { description: Catégorie déjà existante }
 */
router.get('/', authenticate, requireClient, list);

/**
 * @openapi
 * /api/categories-produit/{id}:
 *   get:
 *     tags: [Référentiel]
 *     summary: Récupérer une catégorie de produit par ID
 *     parameters: [{ in: path, name: id, required: true, schema: { type: integer } }]
 *     responses:
 *       200: { description: Catégorie trouvée }
 *       404: { description: Catégorie introuvable }
 *   put:
 *     tags: [Référentiel]
 *     summary: Modifier une catégorie de produit
 *     parameters: [{ in: path, name: id, required: true, schema: { type: integer } }]
 *     responses:
 *       200: { description: Catégorie mise à jour }
 *   delete:
 *     tags: [Référentiel]
 *     summary: Supprimer une catégorie de produit
 *     parameters: [{ in: path, name: id, required: true, schema: { type: integer } }]
 *     responses:
 *       204: { description: Catégorie supprimée }
 */
router.get('/:id', authenticate, requireClient, getById);
router.post('/', authenticate, requireClient, validateNom, create);
router.put('/:id', authenticate, requireClient, validateUpdate, update);
router.delete('/:id', authenticate, requireClient, remove);

module.exports = router;
