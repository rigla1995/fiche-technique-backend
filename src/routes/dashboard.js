const express = require('express');
const router = express.Router();
const { getClientDashboard, getLaboDashboard, getRapportVentes, getActivitesDashboard } = require('../controllers/dashboardController');
const { getDashboardV2 } = require('../controllers/dashboardV2Controller');
const { authenticate, requireClient } = require('../middleware/auth');

// GET /api/dashboard/v2?tab=overview|ventes|achats|pertes|labo|filtres
//   + filtres multi (listes CSV) : activites, labos, canaux, prestataires,
//     catProduits, typesProduit, catArticles, familles, fournisseurs, typesPerte
router.get('/v2', authenticate, requireClient, getDashboardV2);

// GET /api/dashboard/client?from=YYYY-MM-DD&to=YYYY-MM-DD&activiteId=
router.get('/client', authenticate, requireClient, getClientDashboard);
// GET /api/dashboard/labo?laboId=&from=&to=
router.get('/labo', authenticate, requireClient, getLaboDashboard);
// GET /api/dashboard/rapport-ventes?from=&to=&activiteId=&canal=&categorieId=
router.get('/rapport-ventes', authenticate, requireClient, getRapportVentes);
// GET /api/dashboard/activites?from=&to=&activiteId=&categorieId=
router.get('/activites', authenticate, requireClient, getActivitesDashboard);

module.exports = router;
