/**
 * Routes modul Verifikasi Masal.
 * SEMUA route: auth JWT + role ADMIN (pola sama seperti koreksiBankRoutes).
 * Halaman-halaman modul ini memang khusus operator/petugas keuangan (admin).
 */
'use strict';

const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const checkRole = require('../middleware/roleMiddleware');
const verificationController = require('../controllers/verificationController');

router.post('/upload', authMiddleware, checkRole(['admin']), verificationController.uploadBatch);
router.get('/template', authMiddleware, checkRole(['admin']), verificationController.getTemplate);
router.get('/batches', authMiddleware, checkRole(['admin']), verificationController.listBatches);
router.get('/batches/:id', authMiddleware, checkRole(['admin']), verificationController.getBatch);
router.get('/batches/:id/items', authMiddleware, checkRole(['admin']), verificationController.getBatchItems);
router.post('/batches/:id/cancel', authMiddleware, checkRole(['admin']), verificationController.cancelBatch);
router.post('/batches/:id/retry-failed', authMiddleware, checkRole(['admin']), verificationController.retryFailed);
router.get('/batches/:id/export', authMiddleware, checkRole(['admin']), verificationController.exportBatch);
router.delete('/batches/:id', authMiddleware, checkRole(['admin']), verificationController.deleteBatch);

router.post('/verify-single', authMiddleware, checkRole(['admin']), verificationController.verifySingle);
router.get('/single-logs', authMiddleware, checkRole(['admin']), verificationController.listSingleLogs);
router.delete('/single-logs', authMiddleware, checkRole(['admin']), verificationController.clearSingleLogs);
router.get('/summary', authMiddleware, checkRole(['admin']), verificationController.getSummary);
router.get('/mode', authMiddleware, checkRole(['admin']), verificationController.getMode);

module.exports = router;