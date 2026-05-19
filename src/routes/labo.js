const express = require('express');
const router = express.Router();
const {
  createLabo, updateLabo, deleteLabo, listLabos, getLaboById,
  getLaboIngredients, toggleLaboIngredient,
  getLaboStock, updateLaboStock, getLaboStockHistory,
  getLaboFournisseurs, syncLaboFournisseurs,
  updateLaboSeuilMin,
  createTransfer, getTransferHistory, updateTransfer, deleteTransfer, getTransferPrix,
  getActivityAssignments, toggleActivityAssignment,
  getLaboHistorique, updateLaboHistoriqueEntry, deleteLaboHistoriqueEntry,
  exportLaboHistoriqueExcel, exportLaboHistoriquePdf,
  createLaboPerte,
  getLaboPTRecipe,
  exportLaboTransferExcel,
} = require('../controllers/laboController');
const {
  getLaboInventaireStock, saveLaboInventaire,
  getLaboInventaireHistorique, exportLaboInventaireExcel,
} = require('../controllers/inventaireController');
const { getPrixLaboPerte, getDateRangeLaboPerte, listLaboPertes, exportLaboPerteExcel, exportLaboPertesPdf } = require('../controllers/pertesController');
const { authenticate, requireEntreprise } = require('../middleware/auth');
const { laboVentes, laboVentesStats } = require('../controllers/ventesController');

/**
 * @openapi
 * /api/labo:
 *   get:
 *     tags: [Labo]
 *     summary: Lister les laboratoires de l'entreprise
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Liste des labos
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
 *                   createdAt:
 *                     type: string
 *                     format: date-time
 *       401:
 *         description: Non authentifié
 *       403:
 *         description: Accès réservé aux entreprises
 */
router.get('/', authenticate, requireEntreprise, listLabos);

// Ventes labo (transferts valorisés) — doit être AVANT /:laboId
router.get('/ventes', authenticate, requireEntreprise, laboVentes);
router.get('/ventes/stats', authenticate, requireEntreprise, laboVentesStats);

/**
 * @openapi
 * /api/labo:
 *   post:
 *     tags: [Labo]
 *     summary: Créer un nouveau laboratoire
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
 *     responses:
 *       201:
 *         description: Labo créé
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: integer
 *                 nom:
 *                   type: string
 *       400:
 *         description: Données invalides
 *       401:
 *         description: Non authentifié
 */
router.post('/', authenticate, requireEntreprise, createLabo);
router.get('/:laboId', authenticate, requireEntreprise, getLaboById);
router.put('/:laboId', authenticate, requireEntreprise, updateLabo);
router.delete('/:laboId', authenticate, requireEntreprise, deleteLabo);

/**
 * @openapi
 * /api/labo/{laboId}/ingredients:
 *   get:
 *     tags: [Labo]
 *     summary: Récupérer les ingrédients d'un laboratoire
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: laboId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID du laboratoire
 *     responses:
 *       200:
 *         description: Liste des ingrédients du labo
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
 *                   quantite:
 *                     type: number
 *       401:
 *         description: Non authentifié
 *       404:
 *         description: Labo introuvable
 */
router.get('/:laboId/ingredients', authenticate, requireEntreprise, getLaboIngredients);
router.post('/:laboId/ingredients/:ingredientId/select', authenticate, requireEntreprise, toggleLaboIngredient);

// Labo stock
router.get('/:laboId/stock', authenticate, requireEntreprise, getLaboStock);
router.get('/:laboId/pt/:produitId/recipe', authenticate, requireEntreprise, getLaboPTRecipe);
router.put('/:laboId/stock/:ingredientId', authenticate, requireEntreprise, updateLaboStock);
router.get('/:laboId/stock/:ingredientId/history', authenticate, requireEntreprise, getLaboStockHistory);
router.get('/:laboId/pertes/historique', authenticate, requireEntreprise, listLaboPertes);
router.get('/:laboId/pertes/historique/export-excel', authenticate, requireEntreprise, exportLaboPerteExcel);
router.get('/:laboId/pertes/historique/export-pdf', authenticate, requireEntreprise, exportLaboPertesPdf);
router.get('/:laboId/pertes/prix', authenticate, requireEntreprise, getPrixLaboPerte);
router.get('/:laboId/pertes/date-range', authenticate, requireEntreprise, getDateRangeLaboPerte);
router.post('/:laboId/stock/:ingredientId/perte', authenticate, requireEntreprise, createLaboPerte);

// Labo fournisseurs (non-labo fournisseurs assigned to this labo)
router.get('/:laboId/fournisseurs', authenticate, requireEntreprise, getLaboFournisseurs);
router.put('/:laboId/fournisseurs/sync', authenticate, requireEntreprise, syncLaboFournisseurs);

// Labo ingredient seuil min
router.put('/:laboId/ingredients/:ingredientId/seuil-min', authenticate, requireEntreprise, updateLaboSeuilMin);

// Activity ingredient assignments
router.get('/:laboId/activity-assignments', authenticate, requireEntreprise, getActivityAssignments);
router.post('/:laboId/ingredients/:ingredientId/assign-to-activity', authenticate, requireEntreprise, toggleActivityAssignment);

// Labo historique appro
router.get('/:laboId/historique', authenticate, requireEntreprise, getLaboHistorique);
router.get('/:laboId/historique/export-excel', authenticate, requireEntreprise, exportLaboHistoriqueExcel);
router.get('/:laboId/historique/export-pdf', authenticate, requireEntreprise, exportLaboHistoriquePdf);
router.put('/:laboId/historique/:entryId', authenticate, requireEntreprise, updateLaboHistoriqueEntry);
router.delete('/:laboId/historique/:entryId', authenticate, requireEntreprise, deleteLaboHistoriqueEntry);

// Transfers
router.post('/:laboId/transfer', authenticate, requireEntreprise, createTransfer);
router.get('/:laboId/transfers', authenticate, requireEntreprise, getTransferHistory);
router.get('/:laboId/transfers/export-excel', authenticate, requireEntreprise, exportLaboTransferExcel);
router.get('/:laboId/transfers/:transferId/prix', authenticate, requireEntreprise, getTransferPrix);
router.patch('/:laboId/transfers/:transferId', authenticate, requireEntreprise, updateTransfer);
router.delete('/:laboId/transfers/:transferId', authenticate, requireEntreprise, deleteTransfer);

// Inventaire labo
router.get('/:laboId/inventaire', authenticate, requireEntreprise, getLaboInventaireStock);
router.post('/:laboId/inventaire', authenticate, requireEntreprise, saveLaboInventaire);
router.get('/:laboId/inventaire/historique', authenticate, requireEntreprise, getLaboInventaireHistorique);
router.get('/:laboId/inventaire/historique/export-excel', authenticate, requireEntreprise, exportLaboInventaireExcel);

module.exports = router;
