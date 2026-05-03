const express = require('express');
const router = express.Router();
const {
  listFournisseursIndep, createFournisseurIndep,
  updateFournisseurIndep, deleteFournisseurIndep,
} = require('../controllers/fournisseurController');
const { authenticate, requireClient } = require('../middleware/auth');

const requireIndep = (req, res, next) => {
  if (req.user.compteType !== 'independant') {
    return res.status(403).json({ message: 'Réservé aux comptes indépendants' });
  }
  next();
};

router.get('/', authenticate, requireClient, requireIndep, listFournisseursIndep);
router.post('/', authenticate, requireClient, requireIndep, createFournisseurIndep);
router.put('/:id', authenticate, requireClient, requireIndep, updateFournisseurIndep);
router.delete('/:id', authenticate, requireClient, requireIndep, deleteFournisseurIndep);

module.exports = router;
