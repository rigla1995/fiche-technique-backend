const express = require('express');
const router = express.Router();
const { list, create, update, remove } = require('../controllers/domainesController');
const { authenticate, requireSuperAdmin } = require('../middleware/auth');

router.get('/', authenticate, list);
router.post('/', authenticate, requireSuperAdmin, create);
router.put('/:id', authenticate, requireSuperAdmin, update);
router.delete('/:id', authenticate, requireSuperAdmin, remove);

module.exports = router;
