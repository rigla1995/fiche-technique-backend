const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { listPublic } = require('../controllers/manuelController');

/**
 * @openapi
 * /api/manuel:
 *   get:
 *     tags: [Manuel]
 *     summary: Sections actives du manuel d'utilisation (filtrées selon le rôle)
 *     responses:
 *       200:
 *         description: Liste ordonnée des sections (slug, titre, partie, contenu markdown…)
 */
router.get('/', authenticate, listPublic);

module.exports = router;
