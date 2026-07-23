const express = require('express');
const router = express.Router();
const { list, create, update, remove, inviter, getTemplate, importAcheteurs } = require('../controllers/acheteursController');
const {
  listOffres, upsertOffre, getOffreHistorique,
  createVente, listCommandes, getCommande, expedierCommande, livrerCommande, annulerCommande, downloadFacturePdf,
} = require('../controllers/acheteurVentesController');
const { authenticate, requireEntreprise, requireModuleAcheteurs, requireGerantAcheteursAccess } = require('../middleware/auth');

// Module opt-in : TOUTES les routes du carnet exigent le module actif (403 sinon).
// Client ET gérant — mais le gérant doit être explicitement autorisé par le compte
// (utilisateurs.gerant_acces_acheteurs) ET avoir au moins un labo affecté.
router.use(authenticate, requireGerantAcheteursAccess);

/**
 * @openapi
 * /api/acheteurs:
 *   get:
 *     tags: [Acheteurs]
 *     summary: Carnet d'acheteurs du compte (+ quota)
 *     responses:
 *       200:
 *         description: Liste des acheteurs
 *   post:
 *     tags: [Acheteurs]
 *     summary: Créer un ou plusieurs acheteurs (multi-ajout)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               acheteurs:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [nom]
 *                   properties:
 *                     nom: { type: string }
 *                     entreprise: { type: string }
 *                     email: { type: string }
 *                     telephone: { type: string }
 *                     adresse: { type: string }
 *                     matriculeFiscal: { type: string }
 *                     creerCompte: { type: boolean }
 *     responses:
 *       201:
 *         description: Acheteurs créés
 *       403:
 *         description: Module inactif ou quota atteint
 *
 * /api/acheteurs/template:
 *   get:
 *     tags: [Acheteurs]
 *     summary: Modèle Excel d'import du carnet
 *     responses:
 *       200:
 *         description: Fichier Excel
 *
 * /api/acheteurs/import:
 *   post:
 *     tags: [Acheteurs]
 *     summary: Import Excel du carnet (champ creerComptes pour inviter les lignes avec email)
 *     responses:
 *       200:
 *         description: Import effectué
 *
 * /api/acheteurs/{id}/inviter:
 *   post:
 *     tags: [Acheteurs]
 *     summary: Créer le compte de l'acheteur ou renvoyer son invitation
 *     responses:
 *       200:
 *         description: Invitation envoyée
 */
router.get('/template', authenticate, requireEntreprise, requireModuleAcheteurs, getTemplate);
router.get('/', authenticate, requireEntreprise, requireModuleAcheteurs, list);
router.post('/', authenticate, requireEntreprise, requireModuleAcheteurs, create);
router.post('/import', authenticate, requireEntreprise, requireModuleAcheteurs, importAcheteurs);

// ── Lot 2 : tarifs (offres), ventes/commandes, factures ────────────────────
router.get('/offres', authenticate, requireEntreprise, requireModuleAcheteurs, listOffres);
router.post('/offres', authenticate, requireEntreprise, requireModuleAcheteurs, upsertOffre);
router.get('/offres/:id/historique', authenticate, requireEntreprise, requireModuleAcheteurs, getOffreHistorique);
router.post('/ventes', authenticate, requireEntreprise, requireModuleAcheteurs, createVente);
router.get('/commandes', authenticate, requireEntreprise, requireModuleAcheteurs, listCommandes);
router.get('/commandes/:id', authenticate, requireEntreprise, requireModuleAcheteurs, getCommande);
router.post('/commandes/:id/expedier', authenticate, requireEntreprise, requireModuleAcheteurs, expedierCommande);
// Alias historique (ancien nom de l'action, conservé le temps du déploiement front)
router.post('/commandes/:id/valider', authenticate, requireEntreprise, requireModuleAcheteurs, expedierCommande);
router.post('/commandes/:id/livrer', authenticate, requireEntreprise, requireModuleAcheteurs, livrerCommande);
router.post('/commandes/:id/annuler', authenticate, requireEntreprise, requireModuleAcheteurs, annulerCommande);
router.get('/factures/:id/pdf', authenticate, requireEntreprise, requireModuleAcheteurs, downloadFacturePdf);

router.post('/:id/inviter', authenticate, requireEntreprise, requireModuleAcheteurs, inviter);
router.put('/:id', authenticate, requireEntreprise, requireModuleAcheteurs, update);
router.delete('/:id', authenticate, requireEntreprise, requireModuleAcheteurs, remove);

module.exports = router;
