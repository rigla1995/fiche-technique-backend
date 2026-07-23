const express = require('express');
const router = express.Router();
const { getClientDashboard, getLaboDashboard, getRapportVentes, getActivitesDashboard } = require('../controllers/dashboardController');
const { getDashboardV2 } = require('../controllers/dashboardV2Controller');
const { authenticate, requireClientOwner } = require('../middleware/auth');

// Tableau de bord réservé au compte client propriétaire : les gérants n'y ont pas accès.

// GET /api/dashboard/v2?tab=overview|ventes|achats|pertes|labo|filtres
//   + filtres multi (listes CSV) : activites, labos, canaux, prestataires,
//     catProduits, typesProduit, catArticles, familles, fournisseurs, typesPerte
router.get('/v2', authenticate, requireClientOwner, getDashboardV2);

// GET /api/dashboard/client?from=YYYY-MM-DD&to=YYYY-MM-DD&activiteId=
router.get('/client', authenticate, requireClientOwner, getClientDashboard);
// GET /api/dashboard/labo?laboId=&from=&to=
router.get('/labo', authenticate, requireClientOwner, getLaboDashboard);
// GET /api/dashboard/rapport-ventes?from=&to=&activiteId=&canal=&categorieId=
router.get('/rapport-ventes', authenticate, requireClientOwner, getRapportVentes);
// GET /api/dashboard/activites?from=&to=&activiteId=&categorieId=
router.get('/activites', authenticate, requireClientOwner, getActivitesDashboard);

module.exports = router;
