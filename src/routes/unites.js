const express = require('express');
const { body } = require('express-validator');
const router = express.Router();
const { list, create, update, remove } = require('../controllers/unitesController');
const { authenticate } = require('../middleware/auth');

const validateUnite = [
  body().custom((b) => {
    if (!b.name && !b.nom) throw new Error('Nom de l\'unité requis');
    return true;
  }),
];

/**
 * @openapi
 * /api/unites:
 *   get:
 *     tags: [Référentiel]
 *     summary: Lister toutes les unités de mesure
 *     responses:
 *       200:
 *         description: Liste des unités
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
 *     summary: Créer une unité de mesure
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name: { type: string, example: kg }
 *     responses:
 *       201:
 *         description: Unité créée
 *       400:
 *         description: Nom requis
 */
router.get('/', authenticate, list);
router.post('/', authenticate, validateUnite, create);

/**
 * @openapi
 * /api/unites/{id}:
 *   put:
 *     tags: [Référentiel]
 *     summary: Modifier une unité de mesure
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
 *             properties:
 *               name: { type: string }
 *     responses:
 *       200:
 *         description: Unité mise à jour
 *       404:
 *         description: Unité introuvable
 *   delete:
 *     tags: [Référentiel]
 *     summary: Supprimer une unité de mesure
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Unité supprimée
 *       409:
 *         description: Unité utilisée, suppression impossible
 */
router.put('/:id', authenticate, validateUnite, update);
router.delete('/:id', authenticate, remove);

module.exports = router;
