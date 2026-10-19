const express = require('express');
const router = express.Router();
const { getCatalogue, createCommande, listMesCommandes, getMaCommande, downloadMaFacture } = require('../controllers/portailController');
const { authenticate, requireAcheteur, requireModuleAcheteurs } = require('../middleware/auth');

// Portail acheteur : réservé au rôle 'acheteur', module actif chez le vendeur.
// requireModuleAcheteurs résout le compte via req.user.acheteurClientId.

/**
 * @openapi
 * /api/portail/catalogue:
 *   get:
 *     tags: [Acheteurs]
 *     summary: Catalogue de commande de l'acheteur connecté (badge dispo/rupture, jamais les quantités)
 *     responses:
 *       200:
 *         description: Offres actives du vendeur
 *
 * /api/portail/commandes:
 *   get:
 *     tags: [Acheteurs]
 *     summary: Commandes de l'acheteur connecté
 *     responses:
 *       200:
 *         description: Liste des commandes
 *   post:
 *     tags: [Acheteurs]
 *     summary: Passer une commande (statut en_attente, prix figés depuis les offres)
 *     responses:
 *       201:
 *         description: Commande créée
 */
router.get('/catalogue', authenticate, requireAcheteur, requireModuleAcheteurs, getCatalogue);
router.get('/commandes', authenticate, requireAcheteur, requireModuleAcheteurs, listMesCommandes);
router.post('/commandes', authenticate, requireAcheteur, requireModuleAcheteurs, createCommande);
router.get('/commandes/:id', authenticate, requireAcheteur, requireModuleAcheteurs, getMaCommande);
// Module Livreurs (L3) : la facture signée / cachetée rapportée par le livreur
router.get('/commandes/:id/livraison/piece', authenticate, requireAcheteur, requireModuleAcheteurs, require('../controllers/livraisonsController').piecePortail);
router.get('/factures/:id/pdf', authenticate, requireAcheteur, requireModuleAcheteurs, downloadMaFacture);

module.exports = router;
