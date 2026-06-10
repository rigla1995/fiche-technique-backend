const express = require('express');
const router = express.Router();
const {
  listFournisseursIndep, createFournisseurIndep,
  updateFournisseurIndep, deleteFournisseurIndep,
} = require('../controllers/fournisseurController');
const { authenticate, requireClient } = require('../middleware/auth');

const requireIndep = (req, res, next) => {
  if (req.user.compteType !== 'independant') {
    return res.status(403).json({ message: 'Réservé aux comptes indépendants' });
  }
  next();
};

/**
 * @openapi
 * /api/fournisseurs:
 *   get:
 *     tags: [Fournisseurs]
 *     summary: Lister les fournisseurs (compte indépendant)
 *     responses:
 *       200:
 *         description: Liste des fournisseurs
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Fournisseur'
 *       403:
 *         description: Réservé aux comptes indépendants
 *   post:
 *     tags: [Fournisseurs]
 *     summary: Créer un fournisseur (compte indépendant)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [nom]
 *             properties:
 *               nom: { type: string, example: Fournisseur ABC }
 *               adresse: { type: string, nullable: true }
 *               telephone: { type: string, nullable: true }
 *     responses:
 *       201:
 *         description: Fournisseur créé
 *
 * /api/fournisseurs/{id}:
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
 *               adresse: { type: string }
 *               telephone: { type: string }
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
 */
router.get('/', authenticate, requireClient, requireIndep, listFournisseursIndep);
router.post('/', authenticate, requireClient, requireIndep, createFournisseurIndep);
router.put('/:id', authenticate, requireClient, requireIndep, updateFournisseurIndep);
router.delete('/:id', authenticate, requireClient, requireIndep, deleteFournisseurIndep);

module.exports = router;
