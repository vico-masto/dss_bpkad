const express = require('express');
const router = express.Router();
const apiKeyMiddleware = require('../middleware/apiKeyMiddleware');
const {
  receiveSp2d,
  receiveSp2dBatch,
  receiveFromAntigravity,
  receiveFromAntigravityBatch,
  healthCheck
} = require('../controllers/bridgeController');

// Semua route bridge pakai API Key (bukan JWT)
router.use(apiKeyMiddleware);

// SP2D endpoints
router.post('/sp2d', receiveSp2d);
router.post('/sp2d/batch', receiveSp2dBatch);

// Antigravity endpoints (partial data from PDF splitter)
router.post('/antigravity', receiveFromAntigravity);
router.post('/antigravity/batch', receiveFromAntigravityBatch);

// Health check
router.get('/health', healthCheck);

module.exports = router;
