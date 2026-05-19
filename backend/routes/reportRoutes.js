const express = require('express');
const router = express.Router();
const reportController = require('../controllers/reportController');
const authMiddleware = require('../middleware/authMiddleware');

const reconciliationController = require('../controllers/reconciliationController');

// Debug middleware for report routes
router.use((req, res, next) => {
  console.log(`[DEBUG REPORT ROUTER] Request received: ${req.method} ${req.url}`);
  next();
});

// Reconciliation - MOVED TO TOP FOR PRIORITY
router.get('/health', (req, res) => res.json({ status: 'Report router is active' }));

router.get('/reconciliation/anomalies', authMiddleware, reconciliationController.getAnomalies);
router.get('/reconciliation/smart-progress', authMiddleware, reconciliationController.getSmartMatchProgress);
console.log('[DEBUG] Route /reconciliation/anomalies & /reconciliation/smart-progress registered');

router.get('/bku', authMiddleware, reportController.getBKU);
router.get('/dashboard-stats', authMiddleware, reportController.getDashboardStats);
router.get('/sp2d-analytics', authMiddleware, reportController.getSp2dAnalytics);
router.get('/tax-monitoring', authMiddleware, reportController.getTaxMonitoring);
router.get('/bank-ledger', authMiddleware, reportController.getBankLedger);
router.get('/opd-ledger', authMiddleware, reportController.getOpdLedger);
router.get('/bailout-monitoring', authMiddleware, reportController.getBailoutMonitoring);
router.get('/rister-bku', authMiddleware, reportController.getBKURister);
router.get('/opd-tax-summary', authMiddleware, reportController.getOpdTaxSummary);
router.get('/tax-monthly-analytics', authMiddleware, reportController.getMonthlyTaxAnalytics);
router.get('/reconciliation/potongan-integrity', authMiddleware, reconciliationController.getPotonganIntegrity);
router.get('/reconciliation/data', authMiddleware, reconciliationController.getReconciliationData);
router.post('/reconciliation/match', authMiddleware, reconciliationController.runMagicMatch);
router.post('/reconciliation/import', authMiddleware, reconciliationController.importBankData);
router.get('/reconciliation/suggestions/:bankId', authMiddleware, reconciliationController.getSuggestions);
router.get('/reconciliation/bank-list', authMiddleware, reconciliationController.getBankStatements);
router.delete('/reconciliation/bank/:id', authMiddleware, reconciliationController.deleteBankItem);
router.post('/reconciliation/match-individual', authMiddleware, reconciliationController.matchIndividual);
router.post('/reconciliation/match-multiple', authMiddleware, reconciliationController.matchMultiple);
router.post('/reconciliation/unmatch/:id', authMiddleware, reconciliationController.undoMatch);
router.get('/reconciliation/balance-comparison', authMiddleware, reconciliationController.getBalanceComparison);
router.get('/reconciliation/discrepancy-report', authMiddleware, reconciliationController.getDiscrepancyReport);
router.get('/reconciliation/matched-potongan', authMiddleware, reconciliationController.getMatchedPotonganReport);
router.post('/reconciliation/match-bulk', authMiddleware, reconciliationController.bulkMatchByValue);
router.post('/reconciliation/match-smart', authMiddleware, reconciliationController.bulkMatchSmart);
router.post('/reconciliation/unmatch-batch', authMiddleware, reconciliationController.undoMatchBatch);
router.get('/reconciliation/reset-preview', authMiddleware, reconciliationController.getResetPreview);
router.post('/reconciliation/reset-all', authMiddleware, reconciliationController.resetAllReconciliation);
router.post('/reconciliation/save-resolution', authMiddleware, reconciliationController.saveResolution);
router.get('/reconciliation/export-audit', authMiddleware, reconciliationController.exportReconciliationAudit);
router.post('/reconciliation/cluster-match', authMiddleware, reconciliationController.clusterMatch);
console.log('[DEBUG] Reconciliation routes registered in reportRoutes');


module.exports = router;
