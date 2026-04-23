const express = require('express');
const router = express.Router();
const {
  getEntreprise, upsertEntreprise,
  listActivites, createActivite, updateActivite, deleteActivite, duplicateActivite,
  hasActivites,
} = require('../controllers/entrepriseController');
const { authenticate, requireClient } = require('../middleware/auth');

// Company profile
router.get('/', authenticate, requireClient, getEntreprise);
router.put('/', authenticate, requireClient, upsertEntreprise);

// Activities
router.get('/activites/has', authenticate, requireClient, hasActivites);
router.get('/activites', authenticate, requireClient, listActivites);
router.post('/activites', authenticate, requireClient, createActivite);
router.put('/activites/:id', authenticate, requireClient, updateActivite);
router.delete('/activites/:id', authenticate, requireClient, deleteActivite);
router.post('/activites/:id/duplicate', authenticate, requireClient, duplicateActivite);

module.exports = router;
