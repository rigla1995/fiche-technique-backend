// Module « Livreurs » (étape L1). Deux routeurs :
//   gestion — /api/livreurs : le client propriétaire ou un gérant ayant l'accès à la base acheteurs, module Acheteurs actif ;
//   espace  — /api/livreur  : le livreur connecté (rôle « livreur », périmètre fermé par middleware/perimetreLivreur).
const express = require('express');
const {
  authenticate, requireClientOrGerant, requireModuleAcheteurs, requireGerantAcheteursAccess, requireLivreur,
} = require('../middleware/auth');
const livreurs = require('../controllers/livreursController');
const livraisons = require('../controllers/livraisonsController');

const gestion = express.Router();
gestion.use(authenticate, requireClientOrGerant, requireModuleAcheteurs, requireGerantAcheteursAccess);
// L3 : option du compte « les livreurs encaissent à la livraison » (avant /:id pour ne pas être pris pour un identifiant)
gestion.put('/options', livraisons.options);
/**
 * @openapi
 * /api/livreurs/livraisons:
 *   get:
 *     tags: [Livreurs]
 *     summary: "L4 — suivi des livraisons : passages des livreurs (?from&to sur la date du passage, ?livreurId, ?resultat=livree|echec, ?acheteurId) + bilan (total, par livreur, motifs) ; gérant : commandes de ses labos"
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: "{ lignes: [...], stats: { total, livrees, echecs, tauxEchecPct, delaiMoyenJours, encaisse, parLivreur, motifs } }" }
 */
gestion.get('/livraisons', livraisons.suivi);

/**
 * @openapi
 * /api/livreurs:
 *   get:
 *     tags: [Livreurs]
 *     summary: Livreurs du compte et plafond (nb_livreurs de l'abonnement, 5 par défaut)
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: "{ livreurs: Livreur[], max: number | null }" }
 *   post:
 *     tags: [Livreurs]
 *     summary: Créer un livreur (nom, téléphone tunisien ; e-mail facultatif → invitation, sinon mot de passe initial renvoyé une fois)
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       201: { description: Livreur créé (+ emailEnvoye, motDePasseInitial) }
 *       400: { description: NOM_REQUIS, TELEPHONE_INVALIDE, EMAIL_INVALIDE }
 *       409: { description: LIMITE_ATTEINTE, TELEPHONE_DEJA_PRIS, EMAIL_DEJA_PRIS }
 */
gestion.get('/', livreurs.list);
gestion.post('/', livreurs.create);
gestion.put('/:id', livreurs.update);
gestion.delete('/:id', livreurs.remove);
gestion.post('/:id/inviter', livreurs.inviter);
gestion.post('/:id/mot-de-passe', livreurs.motDePasse);

const espace = express.Router();
espace.use(authenticate, requireLivreur);
espace.get('/moi', livreurs.moi);
// L2 : ses livraisons (commandes expédiées qui lui sont confiées, puis ses dernières livrées) — lecture seule
espace.get('/commandes', livreurs.mesCommandes);
espace.get('/commandes/:id', livreurs.maCommande);
/**
 * @openapi
 * /api/livreur/commandes/{id}/livree:
 *   post:
 *     tags: [Livreurs]
 *     summary: "L3 — livraison validée : facture signée / cachetée obligatoire (multipart « facture », « apercu » JPEG d'une photo HEIC), receptionnaire, montantPercu + modePaiementId si le compte encaisse"
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: commande livrée }
 *       400: { description: FACTURE_REQUISE, TYPE_REFUSE, MONTANT_REQUIS, MODE_PAIEMENT_REQUIS }
 *       409: { description: STATUT_INCOMPATIBLE }
 * /api/livreur/commandes/{id}/echec:
 *   post:
 *     tags: [Livreurs]
 *     summary: "L3 — livraison non aboutie : { motif, note, rapporteeDepot } → statut livraison_echouee"
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: commande non livrée }
 *       400: { description: MOTIF_REQUIS, NOTE_REQUISE, RAPPORTEE_REQUISE }
 */
espace.post('/commandes/:id/livree', livraisons.televersement, livraisons.livree);
espace.post('/commandes/:id/echec', livraisons.echec);

module.exports = { gestion, espace };
