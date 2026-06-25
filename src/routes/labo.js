const express = require('express');
const router = express.Router();
const {
  createLabo, updateLabo, deleteLabo, listLabos, getLaboById,
  getLaboIngredients, toggleLaboIngredient, getLabosArticlesConsommables,
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
  exportLaboTransferHistoriquePdf,
} = require('../controllers/laboController');
const {
  getLaboInventaireStock, saveLaboInventaire,
  getLaboInventaireHistorique, exportLaboInventaireExcel,
  exportLaboInventaireHistoriquePdf,
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
 *     responses:
 *       200:
 *         description: Liste des labos
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Labo'
 *   post:
 *     tags: [Labo]
 *     summary: Créer un nouveau laboratoire
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [nom]
 *             properties:
 *               nom: { type: string }
 *               adresse: { type: string, nullable: true }
 *               telephone: { type: string, nullable: true }
 *     responses:
 *       201:
 *         description: Labo créé
 *
 * /api/labo/ventes:
 *   get:
 *     tags: [Labo]
 *     summary: Transferts valorisés (ventes labo vers activités)
 *     parameters:
 *       - in: query
 *         name: laboId
 *         schema: { type: integer }
 *       - in: query
 *         name: dateDebut
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: dateFin
 *         schema: { type: string, format: date }
 *     responses:
 *       200:
 *         description: Liste des transferts valorisés
 *
 * /api/labo/ventes/stats:
 *   get:
 *     tags: [Labo]
 *     summary: Statistiques des ventes labo
 *     responses:
 *       200:
 *         description: Statistiques
 *
 * /api/labo/{laboId}:
 *   get:
 *     tags: [Labo]
 *     summary: Récupérer un labo par ID
 *     parameters:
 *       - in: path
 *         name: laboId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Labo trouvé
 *       404:
 *         description: Labo introuvable
 *   put:
 *     tags: [Labo]
 *     summary: Modifier un labo
 *     parameters:
 *       - in: path
 *         name: laboId
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
 *         description: Labo mis à jour
 *   delete:
 *     tags: [Labo]
 *     summary: Supprimer un labo
 *     parameters:
 *       - in: path
 *         name: laboId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Labo supprimé
 *
 * /api/labo/{laboId}/ingredients:
 *   get:
 *     tags: [Labo]
 *     summary: Lister les ingrédients d'un labo
 *     parameters:
 *       - in: path
 *         name: laboId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Ingrédients du labo
 *
 * /api/labo/{laboId}/ingredients/{ingredientId}/select:
 *   post:
 *     tags: [Labo]
 *     summary: Sélectionner/désélectionner un ingrédient pour un labo
 *     parameters:
 *       - in: path
 *         name: laboId
 *         required: true
 *         schema: { type: integer }
 *       - in: path
 *         name: ingredientId
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               selected: { type: boolean }
 *     responses:
 *       200:
 *         description: Sélection mise à jour
 *
 * /api/labo/{laboId}/stock:
 *   get:
 *     tags: [Labo]
 *     summary: Stock du labo
 *     parameters:
 *       - in: path
 *         name: laboId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Stock du labo
 *
 * /api/labo/{laboId}/pt/{produitId}/recipe:
 *   get:
 *     tags: [Labo]
 *     summary: Recette d'un produit transformé dans le contexte du labo
 *     parameters:
 *       - in: path
 *         name: laboId
 *         required: true
 *         schema: { type: integer }
 *       - in: path
 *         name: produitId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Recette
 *
 * /api/labo/{laboId}/stock/{ingredientId}:
 *   put:
 *     tags: [Labo]
 *     summary: Approvisionner un ingrédient dans un labo
 *     parameters:
 *       - in: path
 *         name: laboId
 *         required: true
 *         schema: { type: integer }
 *       - in: path
 *         name: ingredientId
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               quantite: { type: number }
 *               prixUnitaire: { type: number, nullable: true }
 *               dateAppro: { type: string, format: date, nullable: true }
 *               fournisseurId: { type: integer, nullable: true }
 *     responses:
 *       200:
 *         description: Stock mis à jour
 *
 * /api/labo/{laboId}/stock/{ingredientId}/history:
 *   get:
 *     tags: [Labo]
 *     summary: Historique des mouvements d'un ingrédient dans un labo
 *     parameters:
 *       - in: path
 *         name: laboId
 *         required: true
 *         schema: { type: integer }
 *       - in: path
 *         name: ingredientId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Historique
 *
 * /api/labo/{laboId}/pertes/historique:
 *   get:
 *     tags: [Labo]
 *     summary: Historique des pertes d'un labo
 *     parameters:
 *       - in: path
 *         name: laboId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Pertes du labo
 *
 * /api/labo/{laboId}/pertes/historique/export-excel:
 *   get:
 *     tags: [Labo]
 *     summary: Exporter les pertes du labo en Excel
 *     parameters:
 *       - in: path
 *         name: laboId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Fichier Excel
 *         content:
 *           application/vnd.openxmlformats-officedocument.spreadsheetml.sheet:
 *             schema: { type: string, format: binary }
 *
 * /api/labo/{laboId}/pertes/historique/export-pdf:
 *   get:
 *     tags: [Labo]
 *     summary: Exporter les pertes du labo en PDF
 *     parameters:
 *       - in: path
 *         name: laboId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Fichier PDF
 *         content:
 *           application/pdf:
 *             schema: { type: string, format: binary }
 *
 * /api/labo/{laboId}/pertes/prix:
 *   get:
 *     tags: [Labo]
 *     summary: Prix des ingrédients pour les pertes du labo
 *     parameters:
 *       - in: path
 *         name: laboId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Prix
 *
 * /api/labo/{laboId}/pertes/date-range:
 *   get:
 *     tags: [Labo]
 *     summary: Plage de dates des pertes du labo
 *     parameters:
 *       - in: path
 *         name: laboId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Dates min/max
 *
 * /api/labo/{laboId}/stock/{ingredientId}/perte:
 *   post:
 *     tags: [Labo]
 *     summary: Enregistrer une perte pour un ingrédient du labo
 *     parameters:
 *       - in: path
 *         name: laboId
 *         required: true
 *         schema: { type: integer }
 *       - in: path
 *         name: ingredientId
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [quantite, typePerte, datePerte]
 *             properties:
 *               quantite: { type: number }
 *               typePerte: { type: string, enum: [avarie, dechet] }
 *               datePerte: { type: string, format: date }
 *               motif: { type: string, nullable: true }
 *     responses:
 *       201:
 *         description: Perte enregistrée
 *
 * /api/labo/{laboId}/fournisseurs:
 *   get:
 *     tags: [Labo]
 *     summary: Fournisseurs affectés au labo
 *     parameters:
 *       - in: path
 *         name: laboId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Fournisseurs
 *
 * /api/labo/{laboId}/fournisseurs/sync:
 *   put:
 *     tags: [Labo]
 *     summary: Synchroniser les fournisseurs du labo
 *     parameters:
 *       - in: path
 *         name: laboId
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               fournisseurIds: { type: array, items: { type: integer } }
 *     responses:
 *       200:
 *         description: Fournisseurs synchronisés
 *
 * /api/labo/{laboId}/ingredients/{ingredientId}/seuil-min:
 *   put:
 *     tags: [Labo]
 *     summary: Définir le seuil minimum d'un ingrédient du labo
 *     parameters:
 *       - in: path
 *         name: laboId
 *         required: true
 *         schema: { type: integer }
 *       - in: path
 *         name: ingredientId
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               seuilMin: { type: number, nullable: true }
 *     responses:
 *       200:
 *         description: Seuil mis à jour
 *
 * /api/labo/{laboId}/activity-assignments:
 *   get:
 *     tags: [Labo]
 *     summary: Affectations des ingrédients du labo aux activités
 *     parameters:
 *       - in: path
 *         name: laboId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Affectations
 *
 * /api/labo/{laboId}/ingredients/{ingredientId}/assign-to-activity:
 *   post:
 *     tags: [Labo]
 *     summary: Affecter/retirer un ingrédient du labo vers une activité
 *     parameters:
 *       - in: path
 *         name: laboId
 *         required: true
 *         schema: { type: integer }
 *       - in: path
 *         name: ingredientId
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               activiteId: { type: integer }
 *               assigned: { type: boolean }
 *     responses:
 *       200:
 *         description: Affectation mise à jour
 *
 * /api/labo/{laboId}/historique:
 *   get:
 *     tags: [Labo]
 *     summary: Historique des approvisionnements du labo
 *     parameters:
 *       - in: path
 *         name: laboId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Historique appros labo
 *
 * /api/labo/{laboId}/historique/export-excel:
 *   get:
 *     tags: [Labo]
 *     summary: Exporter l'historique appros du labo en Excel
 *     parameters:
 *       - in: path
 *         name: laboId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Fichier Excel
 *         content:
 *           application/vnd.openxmlformats-officedocument.spreadsheetml.sheet:
 *             schema: { type: string, format: binary }
 *
 * /api/labo/{laboId}/historique/export-pdf:
 *   get:
 *     tags: [Labo]
 *     summary: Exporter l'historique appros du labo en PDF
 *     parameters:
 *       - in: path
 *         name: laboId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Fichier PDF
 *         content:
 *           application/pdf:
 *             schema: { type: string, format: binary }
 *
 * /api/labo/{laboId}/historique/{entryId}:
 *   put:
 *     tags: [Labo]
 *     summary: Modifier une entrée d'historique appro du labo
 *     parameters:
 *       - in: path
 *         name: laboId
 *         required: true
 *         schema: { type: integer }
 *       - in: path
 *         name: entryId
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               quantite: { type: number }
 *               prixUnitaire: { type: number }
 *               dateAppro: { type: string, format: date }
 *     responses:
 *       200:
 *         description: Entrée mise à jour
 *   delete:
 *     tags: [Labo]
 *     summary: Supprimer une entrée d'historique appro du labo
 *     parameters:
 *       - in: path
 *         name: laboId
 *         required: true
 *         schema: { type: integer }
 *       - in: path
 *         name: entryId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Entrée supprimée
 *
 * /api/labo/{laboId}/transfer:
 *   post:
 *     tags: [Labo]
 *     summary: Créer un transfert du labo vers une activité
 *     parameters:
 *       - in: path
 *         name: laboId
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [activiteId, produitId, quantite]
 *             properties:
 *               activiteId: { type: integer }
 *               produitId: { type: integer }
 *               quantite: { type: number }
 *               dateTransfert: { type: string, format: date }
 *               prixUnitaire: { type: number, nullable: true }
 *     responses:
 *       201:
 *         description: Transfert créé
 *
 * /api/labo/{laboId}/transfers:
 *   get:
 *     tags: [Labo]
 *     summary: Historique des transferts d'un labo
 *     parameters:
 *       - in: path
 *         name: laboId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Historique des transferts
 *
 * /api/labo/{laboId}/transfers/export-excel:
 *   get:
 *     tags: [Labo]
 *     summary: Exporter les transferts du labo en Excel
 *     parameters:
 *       - in: path
 *         name: laboId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Fichier Excel
 *         content:
 *           application/vnd.openxmlformats-officedocument.spreadsheetml.sheet:
 *             schema: { type: string, format: binary }
 *
 * /api/labo/{laboId}/transfers/export-pdf:
 *   get:
 *     tags: [Labo]
 *     summary: Exporter les transferts du labo en PDF
 *     parameters:
 *       - in: path
 *         name: laboId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Fichier PDF
 *         content:
 *           application/pdf:
 *             schema: { type: string, format: binary }
 *
 * /api/labo/{laboId}/transfers/{transferId}/prix:
 *   get:
 *     tags: [Labo]
 *     summary: Récupérer le prix d'un transfert
 *     parameters:
 *       - in: path
 *         name: laboId
 *         required: true
 *         schema: { type: integer }
 *       - in: path
 *         name: transferId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Prix du transfert
 *
 * /api/labo/{laboId}/transfers/{transferId}:
 *   patch:
 *     tags: [Labo]
 *     summary: Mettre à jour partiellement un transfert
 *     parameters:
 *       - in: path
 *         name: laboId
 *         required: true
 *         schema: { type: integer }
 *       - in: path
 *         name: transferId
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               quantite: { type: number }
 *               prixUnitaire: { type: number }
 *               dateTransfert: { type: string, format: date }
 *     responses:
 *       200:
 *         description: Transfert mis à jour
 *   delete:
 *     tags: [Labo]
 *     summary: Annuler un transfert
 *     parameters:
 *       - in: path
 *         name: laboId
 *         required: true
 *         schema: { type: integer }
 *       - in: path
 *         name: transferId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Transfert annulé
 *
 * /api/labo/{laboId}/inventaire:
 *   get:
 *     tags: [Labo]
 *     summary: Stock du labo pour faire un inventaire
 *     parameters:
 *       - in: path
 *         name: laboId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Stock pour inventaire
 *   post:
 *     tags: [Labo]
 *     summary: Sauvegarder un inventaire pour le labo
 *     parameters:
 *       - in: path
 *         name: laboId
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [dateInventaire, entries]
 *             properties:
 *               dateInventaire: { type: string, format: date }
 *               entries:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     ingredientId: { type: integer }
 *                     quantiteReelle: { type: number }
 *     responses:
 *       200:
 *         description: Inventaire enregistré
 *
 * /api/labo/{laboId}/inventaire/historique:
 *   get:
 *     tags: [Labo]
 *     summary: Historique des inventaires du labo
 *     parameters:
 *       - in: path
 *         name: laboId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Historique inventaires
 *
 * /api/labo/{laboId}/inventaire/historique/export-excel:
 *   get:
 *     tags: [Labo]
 *     summary: Exporter l'historique inventaire du labo en Excel
 *     parameters:
 *       - in: path
 *         name: laboId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Fichier Excel
 *         content:
 *           application/vnd.openxmlformats-officedocument.spreadsheetml.sheet:
 *             schema: { type: string, format: binary }
 *
 * /api/labo/{laboId}/inventaire/historique/export-pdf:
 *   get:
 *     tags: [Labo]
 *     summary: Exporter l'historique inventaire du labo en PDF
 *     parameters:
 *       - in: path
 *         name: laboId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Fichier PDF
 *         content:
 *           application/pdf:
 *             schema: { type: string, format: binary }
 */
router.get('/', authenticate, requireEntreprise, listLabos);
router.get('/ventes', authenticate, requireEntreprise, laboVentes);
router.get('/ventes/stats', authenticate, requireEntreprise, laboVentesStats);
// Articles consommables affectés à TOUS les labos fournis (?laboIds=1,2) — intersection. Refonte Espace Produits.
router.get('/articles-consommables', authenticate, requireEntreprise, getLabosArticlesConsommables);
router.post('/', authenticate, requireEntreprise, createLabo);
router.get('/:laboId', authenticate, requireEntreprise, getLaboById);
router.put('/:laboId', authenticate, requireEntreprise, updateLabo);
router.delete('/:laboId', authenticate, requireEntreprise, deleteLabo);

router.get('/:laboId/ingredients', authenticate, requireEntreprise, getLaboIngredients);
router.post('/:laboId/ingredients/:ingredientId/select', authenticate, requireEntreprise, toggleLaboIngredient);

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

router.get('/:laboId/fournisseurs', authenticate, requireEntreprise, getLaboFournisseurs);
router.put('/:laboId/fournisseurs/sync', authenticate, requireEntreprise, syncLaboFournisseurs);

router.put('/:laboId/ingredients/:ingredientId/seuil-min', authenticate, requireEntreprise, updateLaboSeuilMin);

router.get('/:laboId/activity-assignments', authenticate, requireEntreprise, getActivityAssignments);
router.post('/:laboId/ingredients/:ingredientId/assign-to-activity', authenticate, requireEntreprise, toggleActivityAssignment);

router.get('/:laboId/historique', authenticate, requireEntreprise, getLaboHistorique);
router.get('/:laboId/historique/export-excel', authenticate, requireEntreprise, exportLaboHistoriqueExcel);
router.get('/:laboId/historique/export-pdf', authenticate, requireEntreprise, exportLaboHistoriquePdf);
router.put('/:laboId/historique/:entryId', authenticate, requireEntreprise, updateLaboHistoriqueEntry);
router.delete('/:laboId/historique/:entryId', authenticate, requireEntreprise, deleteLaboHistoriqueEntry);

router.post('/:laboId/transfer', authenticate, requireEntreprise, createTransfer);
router.get('/:laboId/transfers', authenticate, requireEntreprise, getTransferHistory);
router.get('/:laboId/transfers/export-excel', authenticate, requireEntreprise, exportLaboTransferExcel);
router.get('/:laboId/transfers/export-pdf', authenticate, requireEntreprise, exportLaboTransferHistoriquePdf);
router.get('/:laboId/transfers/:transferId/prix', authenticate, requireEntreprise, getTransferPrix);
router.patch('/:laboId/transfers/:transferId', authenticate, requireEntreprise, updateTransfer);
router.delete('/:laboId/transfers/:transferId', authenticate, requireEntreprise, deleteTransfer);

router.get('/:laboId/inventaire', authenticate, requireEntreprise, getLaboInventaireStock);
router.post('/:laboId/inventaire', authenticate, requireEntreprise, saveLaboInventaire);
router.get('/:laboId/inventaire/historique', authenticate, requireEntreprise, getLaboInventaireHistorique);
router.get('/:laboId/inventaire/historique/export-excel', authenticate, requireEntreprise, exportLaboInventaireExcel);
router.get('/:laboId/inventaire/historique/export-pdf', authenticate, requireEntreprise, exportLaboInventaireHistoriquePdf);

module.exports = router;
