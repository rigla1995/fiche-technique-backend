const express = require('express');
const router = express.Router();
const { list, create, update, remove } = require('../controllers/domainesController');
const { authenticate, requireSuperAdmin } = require('../middleware/auth');

/**
 * @openapi
 * /api/domaines:
 *   get:
 *     tags: [Admin]
 *     summary: Lister les domaines d'activité
 *     responses:
 *       200:
 *         description: Liste des domaines
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id: { type: integer }
 *                   nom: { type: string }
 *   post:
 *     tags: [Admin]
 *     summary: Créer un domaine (super_admin)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [nom]
 *             properties:
 *               nom: { type: string, example: Restauration }
 *     responses:
 *       201:
 *         description: Domaine créé
 *       403:
 *         description: Accès refusé
 *
 * /api/domaines/{id}:
 *   put:
 *     tags: [Admin]
 *     summary: Modifier un domaine (super_admin)
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
 *     responses:
 *       200:
 *         description: Domaine mis à jour
 *   delete:
 *     tags: [Admin]
 *     summary: Supprimer un domaine (super_admin)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Domaine supprimé
 */
router.get('/', authenticate, list);
router.post('/', authenticate, requireSuperAdmin, create);
router.put('/:id', authenticate, requireSuperAdmin, update);
router.delete('/:id', authenticate, requireSuperAdmin, remove);

module.exports = router;
