const express = require('express');
const router = express.Router();
const { list, create } = require('../controllers/domainesController');
const { authenticate, requireSuperAdmin } = require('../middleware/auth');

router.get('/', authenticate, list);
router.post('/', authenticate, requireSuperAdmin, create);

module.exports = router;
