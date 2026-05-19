const express = require('express');
const router = express.Router();
const { getBku } = require('../controllers/bkuController');
const authMiddleware = require('../middleware/authMiddleware');

router.get('/', authMiddleware, getBku);

module.exports = router;
