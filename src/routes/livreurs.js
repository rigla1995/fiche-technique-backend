// Module « Livreurs » (étape L1). Deux routeurs :
//   gestion — /api/livreurs : le client propriétaire ou un gérant ayant l'accès à la base acheteurs, module Acheteurs actif ;
//   espace  — /api/livreur  : le livreur connecté (rôle « livreur », périmètre fermé par middleware/perimetreLivreur).
const express = require('express');
const {
  authenticate, requireClientOrGerant, requireModuleAcheteurs, requireGerantAcheteursAccess, requireLivreur,
} = require('../middleware/auth');
const livreurs = require('../controllers/livreursController');

const gestion = express.Router();
gestion.use(authenticate, requireClientOrGerant, requireModuleAcheteurs, requireGerantAcheteursAccess);

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

module.exports = { gestion, espace };
