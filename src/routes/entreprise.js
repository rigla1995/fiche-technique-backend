const express = require('express');
const router = express.Router();
const {
  getEntreprise, upsertEntreprise,
  listActivites, createActivite, updateActivite, deleteActivite, duplicateActivite,
  deleteFranchiseGroup,
  hasActivites, getActiviteIngredients, toggleActiviteIngredient, updateIngredientPrice,
  getActiviteTypesSummary,
} = require('../controllers/entrepriseController');
const { authenticate, requireEntreprise } = require('../middleware/auth');

// Company profile
router.get('/', authenticate, requireEntreprise, getEntreprise);
router.put('/', authenticate, requireEntreprise, upsertEntreprise);

// Activities
router.get('/activites/has', authenticate, requireEntreprise, hasActivites);
router.get('/activites/types-summary', authenticate, requireEntreprise, getActiviteTypesSummary);
router.get('/activites', authenticate, requireEntreprise, listActivites);
router.post('/activites', authenticate, requireEntreprise, createActivite);
router.put('/activites/:id', authenticate, requireEntreprise, updateActivite);
router.delete('/activites/:id', authenticate, requireEntreprise, deleteActivite);
router.delete('/franchise-groups/:group', authenticate, requireEntreprise, deleteFranchiseGroup);
router.post('/activites/:id/duplicate', authenticate, requireEntreprise, duplicateActivite);
router.get('/activites/:id/ingredients', authenticate, requireEntreprise, getActiviteIngredients);
router.post('/activites/:id/ingredients/:ingredientId/select', authenticate, requireEntreprise, toggleActiviteIngredient);
router.put('/activites/:id/ingredients/:ingredientId/price', authenticate, requireEntreprise, updateIngredientPrice);

module.exports = router;
