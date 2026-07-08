const express = require('express');
const router = express.Router();
const { authenticate, requireSuperAdmin, requireClient, requireClientOrGerant } = require('../middleware/auth');
const ab = require('../controllers/abonnementController');
const gerant = require('../controllers/gerantController');
const demande = require('../controllers/demandeController');
const support = require('../controllers/supportController');

/**
 * @openapi
 * /api/abonnements/tarifs:
 *   get:
 *     tags: [Abonnements]
 *     summary: Récupérer la grille tarifaire (super_admin)
 *     responses:
 *       200:
 *         description: Grille tarifaire
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   cle: { type: string }
 *                   valeur: { type: number }
 *                   description: { type: string }
 *
 * /api/abonnements/tarifs/{cle}:
 *   put:
 *     tags: [Abonnements]
 *     summary: Mettre à jour un tarif (super_admin)
 *     parameters:
 *       - in: path
 *         name: cle
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [valeur]
 *             properties:
 *               valeur: { type: number }
 *     responses:
 *       200:
 *         description: Tarif mis à jour
 */
router.get('/tarifs', authenticate, requireSuperAdmin, ab.getTarifs);
router.put('/tarifs/:cle', authenticate, requireSuperAdmin, ab.updateTarif);

/**
 * @openapi
 * /api/abonnements:
 *   get:
 *     tags: [Abonnements]
 *     summary: Lister tous les abonnements clients (super_admin)
 *     parameters:
 *       - in: query
 *         name: mode
 *         schema: { type: string, enum: [actif, read_only, desactive, bloque, archive] }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Liste des abonnements
 *
 * /api/abonnements/client/{clientId}:
 *   get:
 *     tags: [Abonnements]
 *     summary: Récupérer l'abonnement d'un client (super_admin)
 *     parameters:
 *       - in: path
 *         name: clientId
 *         required: true
 *         schema: { type: integer }
 *       - in: query
 *         name: withPricing
 *         schema: { type: string, enum: ['0','1'] }
 *     responses:
 *       200:
 *         description: Abonnement du client
 *       404:
 *         description: Client introuvable
 *
 * /api/abonnements/client/{clientId}/onboarding:
 *   put:
 *     tags: [Abonnements]
 *     summary: Mettre à jour l'étape d'onboarding d'un client (super_admin)
 *     parameters:
 *       - in: path
 *         name: clientId
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               onboardingStep: { type: integer }
 *     responses:
 *       200:
 *         description: Onboarding mis à jour
 *
 * /api/abonnements/client/{clientId}/prolongation:
 *   put:
 *     tags: [Abonnements]
 *     summary: Prolonger l'abonnement d'un client (super_admin)
 *     parameters:
 *       - in: path
 *         name: clientId
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               dateEcheance: { type: string, format: date }
 *               jours: { type: integer }
 *     responses:
 *       200:
 *         description: Prolongation appliquée
 *
 * /api/abonnements/client/{clientId}/mode:
 *   put:
 *     tags: [Abonnements]
 *     summary: Changer le mode de compte d'un client (super_admin)
 *     parameters:
 *       - in: path
 *         name: clientId
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [mode]
 *             properties:
 *               mode: { type: string, enum: [actif, read_only, desactive, bloque, archive] }
 *     responses:
 *       200:
 *         description: Mode mis à jour
 *
 * /api/abonnements/client/{clientId}/notes:
 *   put:
 *     tags: [Abonnements]
 *     summary: Mettre à jour les notes internes d'un client (super_admin)
 *     parameters:
 *       - in: path
 *         name: clientId
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               notes: { type: string, nullable: true }
 *     responses:
 *       200:
 *         description: Notes mises à jour
 *
 * /api/abonnements/client/{clientId}/module-vente:
 *   put:
 *     tags: [Abonnements]
 *     summary: Activer/désactiver le module vente pour un client (super_admin)
 *     parameters:
 *       - in: path
 *         name: clientId
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [actif]
 *             properties:
 *               actif: { type: boolean }
 *     responses:
 *       200:
 *         description: Module vente mis à jour
 *
 * /api/abonnements/client/{clientId}/paiements:
 *   post:
 *     tags: [Abonnements]
 *     summary: Enregistrer ou mettre à jour un paiement mensuel (super_admin)
 *     parameters:
 *       - in: path
 *         name: clientId
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [mois, annee, montant]
 *             properties:
 *               mois: { type: integer, minimum: 1, maximum: 12 }
 *               annee: { type: integer }
 *               montant: { type: number }
 *               statut: { type: string, enum: [paye, en_attente, impaye] }
 *               methodePaiement: { type: string, nullable: true }
 *     responses:
 *       200:
 *         description: Paiement enregistré
 *
 * /api/abonnements/client/{clientId}/montant-mois:
 *   get:
 *     tags: [Abonnements]
 *     summary: Calculer le montant mensuel d'un client (super_admin)
 *     parameters:
 *       - in: path
 *         name: clientId
 *         required: true
 *         schema: { type: integer }
 *       - in: query
 *         name: mois
 *         schema: { type: integer }
 *       - in: query
 *         name: annee
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Montant calculé
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 montant: { type: number }
 *                 detail: { type: object }
 */
router.get('/', authenticate, requireSuperAdmin, ab.listAbonnements);
router.get('/client/:clientId', authenticate, requireSuperAdmin, ab.getAbonnement);
router.put('/client/:clientId/onboarding', authenticate, requireSuperAdmin, ab.updateOnboarding);
router.put('/client/:clientId/prolongation', authenticate, requireSuperAdmin, ab.updateProlongation);
router.put('/client/:clientId/mode', authenticate, requireSuperAdmin, ab.updateMode);
router.put('/client/:clientId/notes', authenticate, requireSuperAdmin, ab.updateNotes);
router.put('/client/:clientId/module-vente', authenticate, requireSuperAdmin, ab.toggleModuleVente);
router.put('/client/:clientId/module-acheteurs', authenticate, requireSuperAdmin, ab.toggleModuleAcheteurs);
router.post('/client/:clientId/paiements', authenticate, requireSuperAdmin, ab.upsertPaiement);
router.get('/paiements/:paiementId/facture', authenticate, requireSuperAdmin, ab.downloadFactureAdmin);
router.get('/client/:clientId/montant-mois', authenticate, requireSuperAdmin, ab.getMontantMois);

/**
 * @openapi
 * /api/abonnements/client/{clientId}/promotions:
 *   get:
 *     tags: [Abonnements]
 *     summary: Lister les promotions d'un client (super_admin)
 *     parameters:
 *       - in: path
 *         name: clientId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Liste des promotions
 *   post:
 *     tags: [Abonnements]
 *     summary: Créer une promotion pour un client (super_admin)
 *     parameters:
 *       - in: path
 *         name: clientId
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [tauxRemise, dateDebut, dateFin]
 *             properties:
 *               tauxRemise: { type: number, minimum: 1, maximum: 100 }
 *               dateDebut: { type: string, format: date }
 *               dateFin: { type: string, format: date }
 *               description: { type: string, nullable: true }
 *     responses:
 *       201:
 *         description: Promotion créée
 *
 * /api/abonnements/promotions/{promoId}:
 *   put:
 *     tags: [Abonnements]
 *     summary: Modifier une promotion (super_admin)
 *     parameters:
 *       - in: path
 *         name: promoId
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               tauxRemise: { type: number }
 *               dateDebut: { type: string, format: date }
 *               dateFin: { type: string, format: date }
 *     responses:
 *       200:
 *         description: Promotion mise à jour
 *   delete:
 *     tags: [Abonnements]
 *     summary: Supprimer une promotion (super_admin)
 *     parameters:
 *       - in: path
 *         name: promoId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Promotion supprimée
 */
router.get('/client/:clientId/promotions', authenticate, requireSuperAdmin, ab.listPromotions);
router.post('/client/:clientId/promotions', authenticate, requireSuperAdmin, ab.createPromotion);
router.put('/promotions/:promoId', authenticate, requireSuperAdmin, ab.updatePromotion);
router.delete('/promotions/:promoId', authenticate, requireSuperAdmin, ab.deletePromotion);

/**
 * @openapi
 * /api/abonnements/client/{clientId}/config:
 *   get:
 *     tags: [Abonnements]
 *     summary: Récupérer la configuration d'abonnement d'un client (super_admin)
 *     parameters:
 *       - in: path
 *         name: clientId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Configuration abonnement
 *   put:
 *     tags: [Abonnements]
 *     summary: Mettre à jour la configuration d'abonnement (super_admin)
 *     parameters:
 *       - in: path
 *         name: clientId
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               activitesSupp: { type: integer }
 *               laboActif: { type: boolean }
 *     responses:
 *       200:
 *         description: Configuration mise à jour
 *
 * /api/abonnements/pricing-preview:
 *   get:
 *     tags: [Abonnements]
 *     summary: Prévisualiser le pricing pour un client (super_admin)
 *     parameters:
 *       - in: query
 *         name: clientId
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Aperçu du prix
 *
 * /api/abonnements/client/{clientId}/confirm-invite:
 *   post:
 *     tags: [Abonnements]
 *     summary: Confirmer et envoyer l'invitation d'un client (super_admin)
 *     parameters:
 *       - in: path
 *         name: clientId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Invitation envoyée
 *
 * /api/abonnements/all-paiements:
 *   get:
 *     tags: [Abonnements]
 *     summary: Historique global des paiements (super_admin)
 *     parameters:
 *       - in: query
 *         name: mois
 *         schema: { type: integer }
 *       - in: query
 *         name: annee
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Liste de tous les paiements
 *
 * /api/abonnements/all-promotions:
 *   get:
 *     tags: [Abonnements]
 *     summary: Historique global des promotions (super_admin)
 *     responses:
 *       200:
 *         description: Liste de toutes les promotions
 *
 * /api/abonnements/admin/sync-promo-statuts:
 *   post:
 *     tags: [Abonnements]
 *     summary: Synchroniser les statuts des promotions expirées (super_admin)
 *     responses:
 *       200:
 *         description: Synchronisation effectuée
 */
router.get('/client/:clientId/config', authenticate, requireSuperAdmin, ab.getAbonnementConfig);
router.put('/client/:clientId/config', authenticate, requireSuperAdmin, ab.updateAbonnementConfig);
router.get('/pricing-preview', authenticate, requireSuperAdmin, ab.getPricingPreview);
router.post('/client/:clientId/confirm-invite', authenticate, requireSuperAdmin, ab.confirmInvite);
router.get('/all-paiements',  authenticate, requireSuperAdmin, ab.allPaiements);
router.get('/all-promotions', authenticate, requireSuperAdmin, ab.allPromotions);
router.post('/admin/sync-promo-statuts', authenticate, requireSuperAdmin, ab.runSyncPromoStatuts);

/**
 * @openapi
 * /api/abonnements/mon-abonnement:
 *   get:
 *     tags: [Abonnements]
 *     summary: Récupérer son propre abonnement (client connecté)
 *     responses:
 *       200:
 *         description: Abonnement du client connecté avec pricing
 *
 * /api/abonnements/supplement-pricing:
 *   get:
 *     tags: [Abonnements]
 *     summary: Obtenir le tarif des suppléments pour le client connecté
 *     responses:
 *       200:
 *         description: Tarification des suppléments
 *
 * /api/abonnements/client/{clientId}/supplement-pricing:
 *   get:
 *     tags: [Abonnements]
 *     summary: Obtenir le tarif des suppléments pour un client spécifique (super_admin)
 *     parameters:
 *       - in: path
 *         name: clientId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Tarification des suppléments du client
 */
router.get('/mon-abonnement', authenticate, requireClient, async (req, res) => {
  req.params.clientId = String(req.user.id);
  req.query.withPricing = '1';
  return ab.getAbonnement(req, res);
});
router.get('/mon-abonnement/paiements/:paiementId/facture', authenticate, requireClient, ab.downloadFactureClient);
router.get('/contrat-actif', authenticate, requireClient, ab.getContratActif);
router.get('/supplement-pricing', authenticate, requireClient, ab.getSupplementPricing);
router.get('/client/:clientId/supplement-pricing', authenticate, requireSuperAdmin, ab.getClientSupplementPricing);

/**
 * @openapi
 * /api/abonnements/gerants:
 *   get:
 *     tags: [Gérant]
 *     summary: Lister les gérants du client connecté
 *     responses:
 *       200:
 *         description: Liste des gérants
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id: { type: integer }
 *                   nom: { type: string }
 *                   email: { type: string }
 *                   activiteId: { type: integer, nullable: true }
 *                   activiteNom: { type: string, nullable: true }
 *   post:
 *     tags: [Gérant]
 *     summary: Créer un compte gérant
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [nom, email, activiteId]
 *             properties:
 *               nom: { type: string }
 *               email: { type: string, format: email }
 *               activiteId: { type: integer }
 *               activiteType: { type: string, enum: [activite, labo], default: activite }
 *     responses:
 *       201:
 *         description: Gérant créé et invitation envoyée
 *       409:
 *         description: Email déjà utilisé
 *
 * /api/abonnements/gerants/{id}:
 *   put:
 *     tags: [Gérant]
 *     summary: Modifier un gérant
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
 *               activiteId: { type: integer }
 *               activiteType: { type: string, enum: [activite, labo] }
 *     responses:
 *       200:
 *         description: Gérant mis à jour
 *   delete:
 *     tags: [Gérant]
 *     summary: Supprimer un gérant
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Gérant supprimé
 */
router.get('/gerants', authenticate, requireClient, gerant.list);
router.post('/gerants', authenticate, requireClient, gerant.create);
router.put('/gerants/:id', authenticate, requireClient, gerant.update);
router.delete('/gerants/:id', authenticate, requireClient, gerant.remove);

/**
 * @openapi
 * /api/abonnements/demandes:
 *   get:
 *     tags: [Abonnements]
 *     summary: Lister mes demandes d'upgrade (client)
 *     responses:
 *       200:
 *         description: Liste des demandes
 *   post:
 *     tags: [Abonnements]
 *     summary: Créer une demande d'upgrade (client)
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               message: { type: string }
 *     responses:
 *       201:
 *         description: Demande créée
 *
 * /api/abonnements/admin/demandes:
 *   get:
 *     tags: [Abonnements]
 *     summary: Lister toutes les demandes d'upgrade (super_admin)
 *     responses:
 *       200:
 *         description: Toutes les demandes
 *
 * /api/abonnements/admin/demandes/{id}:
 *   put:
 *     tags: [Abonnements]
 *     summary: Traiter une demande d'upgrade (super_admin)
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
 *             required: [statut]
 *             properties:
 *               statut: { type: string, enum: [approuvé, rejeté] }
 *               commentaire: { type: string, nullable: true }
 *     responses:
 *       200:
 *         description: Demande traitée
 */
router.get('/demandes', authenticate, requireClient, demande.listMine);
router.post('/demandes', authenticate, requireClient, demande.create);
router.get('/admin/demandes', authenticate, requireSuperAdmin, demande.listAll);
router.put('/admin/demandes/:id', authenticate, requireSuperAdmin, demande.traiter);

/**
 * @openapi
 * /api/abonnements/support:
 *   get:
 *     tags: [Support]
 *     summary: Lister mes tickets de support (client)
 *     responses:
 *       200:
 *         description: Mes tickets
 *   post:
 *     tags: [Support]
 *     summary: Créer un ticket de support (client)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [sujet, message]
 *             properties:
 *               sujet: { type: string }
 *               message: { type: string }
 *               type: { type: string, enum: [question, bug, autre], default: question }
 *     responses:
 *       201:
 *         description: Ticket créé
 *
 * /api/abonnements/support/{id}:
 *   delete:
 *     tags: [Support]
 *     summary: Supprimer un ticket de support (client)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Ticket supprimé
 *
 * /api/abonnements/admin/support:
 *   get:
 *     tags: [Support]
 *     summary: Lister tous les tickets de support (super_admin)
 *     responses:
 *       200:
 *         description: Tous les tickets
 *
 * /api/abonnements/admin/support/{id}/avenant-preview:
 *   get:
 *     tags: [Support]
 *     summary: Prévisualiser l'avenant contractuel pour un ticket (super_admin)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Aperçu avenant
 *
 * /api/abonnements/admin/support/{id}:
 *   put:
 *     tags: [Support]
 *     summary: Traiter un ticket de support (super_admin)
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
 *               statut: { type: string, enum: [ouvert, en_cours, résolu, fermé] }
 *               reponse: { type: string, nullable: true }
 *     responses:
 *       200:
 *         description: Ticket traité
 */
router.get('/support', authenticate, requireClient, support.listMine);
router.post('/support', authenticate, requireClient, support.create);
router.delete('/support/:id', authenticate, requireClient, support.deleteMine);
router.get('/support/:id/contrat-signe', authenticate, requireClient, support.getContratSigne);
router.get('/admin/support', authenticate, requireSuperAdmin, support.listAll);
router.get('/admin/support/:id/avenant-preview', authenticate, requireSuperAdmin, support.previewAvenant);
router.put('/admin/support/:id', authenticate, requireSuperAdmin, support.traiter);

module.exports = router;
