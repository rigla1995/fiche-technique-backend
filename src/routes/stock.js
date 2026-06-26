const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const {
  getStockClient, updateStockClient, getStockClientSummary,
  getStockEntreprise, updateStockEntreprise,
  getHistoryClient, getHistoryEntreprise,
  getHistoriqueAppro, updateHistoriqueEntry, deleteHistoriqueEntry,
  updateSeuilMin, updateSeuilMinClient, createClientPerte,
  exportHistoriqueExcel, exportHistoriquePdf,
  deleteClientIngredientHistory, deleteEntrepriseIngredientHistory,
  getCascadeInfoClient, getCascadeInfoEntreprise,
  getClientIngredientSelections,
} = require('../controllers/stockController');
const { authenticate, requireClient, requireEntreprise } = require('../middleware/auth');
const { listClientPertes, updateClientPerte, deleteClientPerte, exportClientPertes, exportClientPertesPdf, getPrixClientPerte, getDateRangeClientPerte } = require('../controllers/pertesController');

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  next();
};

const approValidation = [
  body('quantite').optional({ nullable: true }).isFloat({ min: 0 }).withMessage('quantite doit être un nombre >= 0'),
  body('prixUnitaire').optional({ nullable: true }).isFloat({ min: 0 }).withMessage('prixUnitaire doit être un nombre >= 0'),
  body('dateAppro').optional({ nullable: true }).isISO8601().withMessage('dateAppro doit être une date ISO8601'),
  body('fournisseurId').optional({ nullable: true }).isInt({ min: 1 }).withMessage('fournisseurId invalide'),
  body('tauxTva').optional({ nullable: true }).isFloat({ min: 0, max: 100 }).withMessage('tauxTva doit être entre 0 et 100'),
];

const seuilMinValidation = [
  body('seuilMin').optional({ nullable: true }).isFloat({ min: 0 }).withMessage('seuilMin doit être un nombre >= 0'),
];

const perteValidation = [
  body('ingredientId').isInt({ min: 1 }).withMessage('ingredientId invalide'),
  body('quantite').isFloat({ min: 0.001 }).withMessage('quantite doit être > 0'),
  body('typePerte').isIn(['avarie', 'dechet']).withMessage('typePerte invalide (avarie|dechet)'),
  body('datePerte').isISO8601().withMessage('datePerte doit être une date ISO8601'),
];

const inventaireValidation = [
  body('dateInventaire').isISO8601().withMessage('dateInventaire doit être une date ISO8601'),
  body('entries').isArray({ min: 1 }).withMessage('entries doit être un tableau non vide'),
  body('entries.*.quantiteReelle').isFloat({ min: 0 }).withMessage('quantiteReelle doit être un nombre >= 0'),
];

/**
 * @openapi
 * /api/stock/client/summary:
 *   get:
 *     tags: [Stock]
 *     summary: Récapitulatif du stock client (alertes, valeur totale)
 *     responses:
 *       200:
 *         description: Récapitulatif stock
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 totalIngredients: { type: integer }
 *                 alertes: { type: integer }
 *                 valeurTotale: { type: number }
 *
 * /api/stock/client/ingredient-selections:
 *   get:
 *     tags: [Stock]
 *     summary: Récupérer les sélections d'ingrédients du client
 *     responses:
 *       200:
 *         description: Sélections d'ingrédients
 *
 * /api/stock/client:
 *   get:
 *     tags: [Stock]
 *     summary: Stock complet du client (compte indépendant)
 *     parameters:
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *       - in: query
 *         name: categorieId
 *         schema: { type: integer }
 *       - in: query
 *         name: alertesOnly
 *         schema: { type: string, enum: ['0','1'] }
 *     responses:
 *       200:
 *         description: Liste du stock
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/StockEntry'
 *
 * /api/stock/client/{ingredientId}:
 *   put:
 *     tags: [Stock]
 *     summary: Approvisionner un ingrédient (client indépendant)
 *     parameters:
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
 *               tauxTva: { type: number, nullable: true }
 *     responses:
 *       200:
 *         description: Stock mis à jour
 *
 * /api/stock/client/{ingredientId}/seuil-min:
 *   put:
 *     tags: [Stock]
 *     summary: Définir le seuil minimum d'alerte (client)
 *     parameters:
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
 * /api/stock/client/pertes:
 *   post:
 *     tags: [Stock]
 *     summary: Enregistrer une perte (client indépendant)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [ingredientId, quantite, typePerte, datePerte]
 *             properties:
 *               ingredientId: { type: integer }
 *               quantite: { type: number, minimum: 0.001 }
 *               typePerte: { type: string, enum: [avarie, dechet] }
 *               datePerte: { type: string, format: date }
 *               motif: { type: string, nullable: true }
 *     responses:
 *       201:
 *         description: Perte enregistrée
 *   get:
 *     tags: [Stock]
 *     summary: Lister les pertes du client
 *     parameters:
 *       - in: query
 *         name: dateDebut
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: dateFin
 *         schema: { type: string, format: date }
 *     responses:
 *       200:
 *         description: Liste des pertes
 *
 * /api/stock/client/pertes/export-excel:
 *   get:
 *     tags: [Stock]
 *     summary: Exporter les pertes du client en Excel
 *     responses:
 *       200:
 *         description: Fichier Excel
 *         content:
 *           application/vnd.openxmlformats-officedocument.spreadsheetml.sheet:
 *             schema: { type: string, format: binary }
 *
 * /api/stock/client/pertes/export-pdf:
 *   get:
 *     tags: [Stock]
 *     summary: Exporter les pertes du client en PDF
 *     responses:
 *       200:
 *         description: Fichier PDF
 *         content:
 *           application/pdf:
 *             schema: { type: string, format: binary }
 *
 * /api/stock/client/pertes/prix:
 *   get:
 *     tags: [Stock]
 *     summary: Récupérer les prix des ingrédients pour calculer la valeur des pertes
 *     responses:
 *       200:
 *         description: Prix des ingrédients
 *
 * /api/stock/client/pertes/date-range:
 *   get:
 *     tags: [Stock]
 *     summary: Plage de dates disponibles pour les pertes du client
 *     responses:
 *       200:
 *         description: Dates min/max
 *
 * /api/stock/client/pertes/{id}:
 *   put:
 *     tags: [Stock]
 *     summary: Modifier une perte (client)
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
 *               quantite: { type: number }
 *               motif: { type: string }
 *     responses:
 *       200:
 *         description: Perte mise à jour
 *   delete:
 *     tags: [Stock]
 *     summary: Supprimer une perte (client)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Perte supprimée
 *
 * /api/stock/client/{ingredientId}/history:
 *   get:
 *     tags: [Stock]
 *     summary: Historique des mouvements d'un ingrédient (client)
 *     parameters:
 *       - in: path
 *         name: ingredientId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Historique des mouvements
 *
 * /api/stock/client/{ingredientId}/cascade-info:
 *   get:
 *     tags: [Stock]
 *     summary: Informations sur les données liées (pour confirmation de désélection)
 *     parameters:
 *       - in: path
 *         name: ingredientId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Nombre d'appros et inventaires liés
 *
 * /api/stock/client/{ingredientId}/all-history:
 *   delete:
 *     tags: [Stock]
 *     summary: Supprimer tout l'historique d'un ingrédient après désélection (client)
 *     parameters:
 *       - in: path
 *         name: ingredientId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Historique supprimé
 */

/**
 * @openapi
 * /api/stock/entreprise/{activiteId}:
 *   get:
 *     tags: [Stock]
 *     summary: Récupérer le stock d'une activité entreprise
 *     parameters:
 *       - in: path
 *         name: activiteId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Stock de l'activité
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/StockEntry'
 *
 * /api/stock/entreprise/{activiteId}/{ingredientId}:
 *   put:
 *     tags: [Stock]
 *     summary: Approvisionner un ingrédient pour une activité entreprise
 *     parameters:
 *       - in: path
 *         name: activiteId
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
 *               tauxTva: { type: number, nullable: true }
 *     responses:
 *       200:
 *         description: Stock mis à jour
 *
 * /api/stock/entreprise/{activiteId}/{ingredientId}/history:
 *   get:
 *     tags: [Stock]
 *     summary: Historique des mouvements d'un ingrédient pour une activité
 *     parameters:
 *       - in: path
 *         name: activiteId
 *         required: true
 *         schema: { type: integer }
 *       - in: path
 *         name: ingredientId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Historique des mouvements
 *
 * /api/stock/entreprise/{activiteId}/{ingredientId}/seuil-min:
 *   put:
 *     tags: [Stock]
 *     summary: Définir le seuil minimum pour un ingrédient d'une activité
 *     parameters:
 *       - in: path
 *         name: activiteId
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
 * /api/stock/entreprise/{activiteId}/{ingredientId}/cascade-info:
 *   get:
 *     tags: [Stock]
 *     summary: Informations cascade avant désélection (entreprise)
 *     parameters:
 *       - in: path
 *         name: activiteId
 *         required: true
 *         schema: { type: integer }
 *       - in: path
 *         name: ingredientId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Nombre de données liées
 *
 * /api/stock/entreprise/{activiteId}/{ingredientId}/all-history:
 *   delete:
 *     tags: [Stock]
 *     summary: Supprimer tout l'historique d'un ingrédient d'une activité
 *     parameters:
 *       - in: path
 *         name: activiteId
 *         required: true
 *         schema: { type: integer }
 *       - in: path
 *         name: ingredientId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Historique supprimé
 */
router.get('/entreprise/:activiteId', authenticate, requireEntreprise, getStockEntreprise);
router.put('/entreprise/:activiteId/:ingredientId', authenticate, requireEntreprise, approValidation, validate, updateStockEntreprise);
router.get('/entreprise/:activiteId/:ingredientId/history', authenticate, requireEntreprise, getHistoryEntreprise);
router.put('/entreprise/:activiteId/:ingredientId/seuil-min', authenticate, requireEntreprise, seuilMinValidation, validate, updateSeuilMin);
router.get('/entreprise/:activiteId/:ingredientId/cascade-info', authenticate, requireEntreprise, getCascadeInfoEntreprise);
router.delete('/entreprise/:activiteId/:ingredientId/all-history', authenticate, requireEntreprise, deleteEntrepriseIngredientHistory);

/**
 * @openapi
 * /api/stock/historique:
 *   get:
 *     tags: [Stock]
 *     summary: Historique des approvisionnements (toutes activités)
 *     parameters:
 *       - in: query
 *         name: activiteId
 *         schema: { type: integer }
 *       - in: query
 *         name: laboId
 *         schema: { type: integer }
 *       - in: query
 *         name: dateDebut
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: dateFin
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Historique des appros
 *
 * /api/stock/historique/export-excel:
 *   get:
 *     tags: [Stock]
 *     summary: Exporter l'historique des appros en Excel
 *     responses:
 *       200:
 *         description: Fichier Excel
 *         content:
 *           application/vnd.openxmlformats-officedocument.spreadsheetml.sheet:
 *             schema: { type: string, format: binary }
 *
 * /api/stock/historique/export-pdf:
 *   get:
 *     tags: [Stock]
 *     summary: Exporter l'historique des appros en PDF
 *     responses:
 *       200:
 *         description: Fichier PDF
 *         content:
 *           application/pdf:
 *             schema: { type: string, format: binary }
 *
 * /api/stock/historique/{id}:
 *   put:
 *     tags: [Stock]
 *     summary: Modifier une entrée d'historique d'appro
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
 *               quantite: { type: number }
 *               prixUnitaire: { type: number }
 *               dateAppro: { type: string, format: date }
 *     responses:
 *       200:
 *         description: Entrée mise à jour
 *   delete:
 *     tags: [Stock]
 *     summary: Supprimer une entrée d'historique d'appro
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Entrée supprimée
 */
router.get('/historique', authenticate, requireClient, getHistoriqueAppro);
router.get('/historique/export-excel', authenticate, requireClient, exportHistoriqueExcel);
router.get('/historique/export-pdf', authenticate, requireClient, exportHistoriquePdf);
router.put('/historique/:id', authenticate, requireClient, updateHistoriqueEntry);
router.delete('/historique/:id', authenticate, requireClient, deleteHistoriqueEntry);

/**
 * @openapi
 * /api/stock/pt:
 *   get:
 *     tags: [Stock]
 *     summary: Stock des produits transformés (semi-finis du labo)
 *     responses:
 *       200:
 *         description: Stock produits transformés
 *
 * /api/stock/pt/{produitId}/recipe:
 *   get:
 *     tags: [Stock]
 *     summary: Recette d'un produit transformé pour calcul de déstockage
 *     parameters:
 *       - in: path
 *         name: produitId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Recette du produit transformé
 *
 * /api/stock/pt/{produitId}/history:
 *   get:
 *     tags: [Stock]
 *     summary: Historique des mouvements d'un produit transformé
 *     parameters:
 *       - in: path
 *         name: produitId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Historique
 *
 * /api/stock/pt/{produitId}:
 *   put:
 *     tags: [Stock]
 *     summary: Mettre à jour le stock d'un produit transformé
 *     parameters:
 *       - in: path
 *         name: produitId
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               quantite: { type: number }
 *               activiteId: { type: integer }
 *     responses:
 *       200:
 *         description: Stock mis à jour
 *
 * /api/stock/pt/{produitId}/seuil-min:
 *   put:
 *     tags: [Stock]
 *     summary: Définir le seuil minimum pour un produit transformé
 *     parameters:
 *       - in: path
 *         name: produitId
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
 */
const { getStockPT, getStockPTHistory, getPTRecipe, saveStockPT, updateSeuilMinPT } = require('../controllers/produitTransformeController');
router.get('/pt', authenticate, requireClient, getStockPT);
router.get('/pt/:produitId/recipe', authenticate, requireClient, getPTRecipe);
router.get('/pt/:produitId/history', authenticate, requireClient, getStockPTHistory);
router.put('/pt/:produitId', authenticate, requireClient, saveStockPT);
router.put('/pt/:produitId/seuil-min', authenticate, requireClient, updateSeuilMinPT);

/**
 * @openapi
 * /api/stock/client/inventaire:
 *   get:
 *     tags: [Stock]
 *     summary: Récupérer l'état du stock pour faire un inventaire (client)
 *     responses:
 *       200:
 *         description: Stock pour inventaire
 *   post:
 *     tags: [Stock]
 *     summary: Sauvegarder un inventaire (client)
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
 * /api/stock/client/inventaire/historique:
 *   get:
 *     tags: [Stock]
 *     summary: Historique des inventaires du client
 *     responses:
 *       200:
 *         description: Historique inventaires
 *
 * /api/stock/client/inventaire/historique/export-excel:
 *   get:
 *     tags: [Stock]
 *     summary: Exporter l'historique des inventaires en Excel (client)
 *     responses:
 *       200:
 *         description: Fichier Excel
 *         content:
 *           application/vnd.openxmlformats-officedocument.spreadsheetml.sheet:
 *             schema: { type: string, format: binary }
 *
 * /api/stock/client/inventaire/historique/export-pdf:
 *   get:
 *     tags: [Stock]
 *     summary: Exporter l'historique des inventaires en PDF (client)
 *     responses:
 *       200:
 *         description: Fichier PDF
 *         content:
 *           application/pdf:
 *             schema: { type: string, format: binary }
 *
 * /api/stock/entreprise/{activiteId}/inventaire:
 *   get:
 *     tags: [Stock]
 *     summary: Récupérer le stock pour inventaire d'une activité
 *     parameters:
 *       - in: path
 *         name: activiteId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Stock pour inventaire
 *   post:
 *     tags: [Stock]
 *     summary: Sauvegarder un inventaire pour une activité
 *     parameters:
 *       - in: path
 *         name: activiteId
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
 * /api/stock/entreprise/{activiteId}/inventaire/historique:
 *   get:
 *     tags: [Stock]
 *     summary: Historique des inventaires d'une activité
 *     parameters:
 *       - in: path
 *         name: activiteId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Historique inventaires activité
 *
 * /api/stock/entreprise/{activiteId}/inventaire/historique/export-excel:
 *   get:
 *     tags: [Stock]
 *     summary: Exporter l'historique inventaire d'une activité en Excel
 *     parameters:
 *       - in: path
 *         name: activiteId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Fichier Excel
 *         content:
 *           application/vnd.openxmlformats-officedocument.spreadsheetml.sheet:
 *             schema: { type: string, format: binary }
 *
 * /api/stock/entreprise/{activiteId}/inventaire/historique/export-pdf:
 *   get:
 *     tags: [Stock]
 *     summary: Exporter l'historique inventaire d'une activité en PDF
 *     parameters:
 *       - in: path
 *         name: activiteId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Fichier PDF
 *         content:
 *           application/pdf:
 *             schema: { type: string, format: binary }
 *
 * /api/stock/inventaire/{inventaireId}:
 *   put:
 *     tags: [Stock]
 *     summary: Modifier une entrée d'inventaire
 *     parameters:
 *       - in: path
 *         name: inventaireId
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               quantiteReelle: { type: number }
 *     responses:
 *       200:
 *         description: Entrée inventaire mise à jour
 */
const {
  getActiviteInventaireStock, saveActiviteInventaire,
  getActiviteInventaireHistorique, exportActiviteInventaireExcel,
  updateInventaireEntry,
  getClientInventaireStock, saveClientInventaire,
  getClientInventaireHistorique, exportClientInventaireExcel,
  exportActiviteInventaireHistoriquePdf, exportClientInventaireHistoriquePdf,
} = require('../controllers/inventaireController');
router.get('/entreprise/:activiteId/inventaire', authenticate, requireEntreprise, getActiviteInventaireStock);
router.post('/entreprise/:activiteId/inventaire', authenticate, requireEntreprise, inventaireValidation, validate, saveActiviteInventaire);
router.get('/entreprise/:activiteId/inventaire/historique', authenticate, requireEntreprise, getActiviteInventaireHistorique);
router.get('/entreprise/:activiteId/inventaire/historique/export-excel', authenticate, requireEntreprise, exportActiviteInventaireExcel);
router.get('/entreprise/:activiteId/inventaire/historique/export-pdf', authenticate, requireEntreprise, exportActiviteInventaireHistoriquePdf);
router.put('/inventaire/:inventaireId', authenticate, requireClient, updateInventaireEntry);

module.exports = router;
