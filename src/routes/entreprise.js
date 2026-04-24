const express = require('express');
const router = express.Router();
const {
  getEntreprise, upsertEntreprise,
  listActivites, createActivite, updateActivite, deleteActivite, duplicateActivite,
  hasActivites, getActiviteIngredients, toggleActiviteIngredient,
} = require('../controllers/entrepriseController');
const { authenticate, requireEntreprise } = require('../middleware/auth');

// Company profile
router.get('/', authenticate, requireEntreprise, getEntreprise);
router.put('/', authenticate, requireEntreprise, upsertEntreprise);

// Activities
router.get('/activites/has', authenticate, requireEntreprise, hasActivites);
router.get('/activites', authenticate, requireEntreprise, listActivites);
router.post('/activites', authenticate, requireEntreprise, createActivite);
router.put('/activites/:id', authenticate, requireEntreprise, updateActivite);
router.delete('/activites/:id', authenticate, requireEntreprise, deleteActivite);
router.post('/activites/:id/duplicate', authenticate, requireEntreprise, duplicateActivite);
router.get('/activites/:id/ingredients', authenticate, requireEntreprise, getActiviteIngredients);
router.post('/activites/:id/ingredients/:ingredientId/select', authenticate, requireEntreprise, toggleActiviteIngredient);

module.exports = router;
