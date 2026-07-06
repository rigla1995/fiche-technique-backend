const express = require('express');
const { body } = require('express-validator');
const router = express.Router();
const { list, getById, create, update, remove } = require('../controllers/clientsController');
const { getRapportsStats } = require('../controllers/adminRapportsController');
const { authenticate, requireSuperAdmin } = require('../middleware/auth');

const validateCreate = [
  body().custom((b) => {
    if (!b.name && !b.nom) throw new Error('Nom requis');
    return true;
  }),
  body('email').isEmail().withMessage('Email invalide'),
  body().custom((b) => {
    const pwd = b.password || b.mot_de_passe;
    if (!pwd) return true;
    if (pwd.length < 8) throw new Error('Mot de passe : 8 caractères minimum');
    if (!/[A-Z]/.test(pwd)) throw new Error('Mot de passe : au moins une majuscule');
    if (!/[a-z]/.test(pwd)) throw new Error('Mot de passe : au moins une minuscule');
    if (!/[0-9]/.test(pwd)) throw new Error('Mot de passe : au moins un chiffre');
    if (!/[@$!%*?&_\-#]/.test(pwd)) throw new Error('Mot de passe : au moins un caractère spécial (@$!%*?&)');
    return true;
  }),
  body('phone').optional({ nullable: true, checkFalsy: false }).custom((val) => {
    if (!val) return true;
    if (!/^(\+216[\s-]?)?[2579]\d{7}$/.test(val.replace(/\s/g, ''))) {
      throw new Error('Numéro de téléphone tunisien invalide (ex: +216 XX XXX XXX)');
    }
    return true;
  }),
];

const validateUpdate = [
  body('name').optional().trim().notEmpty(),
  body('nom').optional().trim().notEmpty(),
  body('email').optional().isEmail().withMessage('Email invalide'),
  body('phone').optional({ nullable: true, checkFalsy: false }).custom((val) => {
    if (!val) return true;
    if (!/^(\+216[\s-]?)?[2579]\d{7}$/.test(val.replace(/\s/g, ''))) {
      throw new Error('Numéro de téléphone tunisien invalide (ex: +216 XX XXX XXX)');
    }
    return true;
  }),
];

/**
 * @openapi
 * /api/admin/rapports/stats:
 *   get:
 *     tags: [Admin]
 *     summary: Statistiques globales pour le tableau de bord admin
 *     description: Retourne des métriques globales — nombre de clients actifs, revenus, abonnements, etc.
 *     responses:
 *       200:
 *         description: Statistiques globales
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 totalClients: { type: integer }
 *                 clientsActifs: { type: integer }
 *                 revenusTotal: { type: number }
 *                 abonnementsActifs: { type: integer }
 *       403:
 *         description: Accès réservé au super_admin
 *
 * /api/admin/clients:
 *   get:
 *     tags: [Admin]
 *     summary: Lister tous les clients (super_admin)
 *     parameters:
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *         description: Recherche par nom ou email
 *       - in: query
 *         name: mode
 *         schema: { type: string, enum: [actif, read_only, desactive, bloque, archive] }
 *     responses:
 *       200:
 *         description: Liste des clients
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/User'
 *   post:
 *     tags: [Admin]
 *     summary: Créer un client (super_admin)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, email]
 *             properties:
 *               name: { type: string }
 *               email: { type: string, format: email }
 *               password: { type: string }
 *               phone: { type: string, nullable: true }
 *     responses:
 *       201:
 *         description: Client créé
 *       400:
 *         description: Données invalides
 *       409:
 *         description: Email déjà utilisé
 *
 * /api/admin/clients/{id}:
 *   get:
 *     tags: [Admin]
 *     summary: Récupérer un client par ID (super_admin)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Client trouvé
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/User'
 *       404:
 *         description: Client introuvable
 *   put:
 *     tags: [Admin]
 *     summary: Modifier un client (super_admin)
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
 *               name: { type: string }
 *               email: { type: string, format: email }
 *               phone: { type: string }
 *     responses:
 *       200:
 *         description: Client mis à jour
 *   delete:
 *     tags: [Admin]
 *     summary: Supprimer un client (super_admin)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Client supprimé
 *       409:
 *         description: Données associées, suppression impossible
 */
router.get('/rapports/stats', authenticate, requireSuperAdmin, getRapportsStats);

router.get('/clients', authenticate, requireSuperAdmin, list);
router.get('/clients/:id', authenticate, requireSuperAdmin, getById);
router.post('/clients', authenticate, requireSuperAdmin, validateCreate, create);
router.put('/clients/:id', authenticate, requireSuperAdmin, validateUpdate, update);
router.delete('/clients/:id', authenticate, requireSuperAdmin, remove);

// ── Base de connaissances des agents IA ───────────────────────────────────────
const { list: kbList, create: kbCreate, update: kbUpdate, remove: kbRemove } = require('../controllers/aiKnowledgeController');
router.get('/knowledge-base', authenticate, requireSuperAdmin, kbList);
router.post('/knowledge-base', authenticate, requireSuperAdmin, kbCreate);
router.put('/knowledge-base/:id', authenticate, requireSuperAdmin, kbUpdate);
router.delete('/knowledge-base/:id', authenticate, requireSuperAdmin, kbRemove);

// ── Manuel d'utilisation (centre d'aide) ──────────────────────────────────────
const manuel = require('../controllers/manuelController');
router.get('/manuel', authenticate, requireSuperAdmin, manuel.adminList);
router.post('/manuel', authenticate, requireSuperAdmin, manuel.create);
router.put('/manuel/:id', authenticate, requireSuperAdmin, manuel.update);
router.post('/manuel/:id/restore', authenticate, requireSuperAdmin, manuel.restore);
router.delete('/manuel/:id', authenticate, requireSuperAdmin, manuel.remove);

module.exports = router;
