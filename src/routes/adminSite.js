const express = require('express');
const router = express.Router();
const { listDemandesAcces, updateDemandeAcces, listPartenaires, updatePartenaire } = require('../controllers/adminSiteController');
const { authenticate, requireSuperAdmin } = require('../middleware/auth');

/**
 * @openapi
 * /admin/site/demandes-acces:
 *   get:
 *     tags: [Admin]
 *     summary: Lister les demandes d'accès du site vitrine (super_admin)
 *     parameters:
 *       - in: query
 *         name: statut
 *         schema: { type: string, enum: [nouvelle, contactee, convertie, refusee] }
 *     responses:
 *       200:
 *         description: Liste des demandes (nouvelles d'abord, puis plus récentes)
 *
 * /admin/site/demandes-acces/{id}:
 *   put:
 *     tags: [Admin]
 *     summary: Traiter une demande d'accès (super_admin)
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
 *               statut: { type: string, enum: [nouvelle, contactee, convertie, refusee] }
 *               notesAdmin: { type: string, nullable: true }
 *               convertedClientId: { type: integer, nullable: true }
 *     responses:
 *       200:
 *         description: Demande mise à jour
 *       404:
 *         description: Demande introuvable
 *
 * /admin/site/partenaires:
 *   get:
 *     tags: [Admin]
 *     summary: Lister les clients activés et leur état partenaire vitrine (super_admin)
 *     responses:
 *       200:
 *         description: Liste {clientId, nom, email, logoSite, sitePartenaireActif}
 *
 * /admin/site/partenaires/{clientId}:
 *   put:
 *     tags: [Admin]
 *     summary: Régler le logo et l'affichage vitrine d'un client (super_admin)
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
 *               logoSite: { type: string, nullable: true, description: 'data-URI image base64, null pour effacer' }
 *               actif: { type: boolean }
 *     responses:
 *       200:
 *         description: Partenaire mis à jour
 *       404:
 *         description: Client introuvable ou non activé
 *       413:
 *         description: Logo trop volumineux
 */
router.get('/demandes-acces', authenticate, requireSuperAdmin, listDemandesAcces);
router.put('/demandes-acces/:id', authenticate, requireSuperAdmin, updateDemandeAcces);
router.get('/partenaires', authenticate, requireSuperAdmin, listPartenaires);
router.put('/partenaires/:clientId', authenticate, requireSuperAdmin, updatePartenaire);

module.exports = router;
