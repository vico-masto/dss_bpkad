const express = require('express');
const router = express.Router();
const dssController = require('../controllers/dssController');
const penyesuaianController = require('../controllers/penyesuaianController');
const saldoAwalController = require('../controllers/saldoAwalController');
const talanganController = require('../controllers/talanganController');
const setoranPajakController = require('../controllers/setoranPajakController');
const simulatorController = require('../controllers/simulatorController');
const intelligenceController = require('../controllers/intelligenceController');
const authMiddleware = require('../middleware/authMiddleware');

const reportController = require('../controllers/reportController');

const reconciliationController = require('../controllers/reconciliationController');

router.get('/reports/bailout-monitoring', authMiddleware, reportController.getBailoutMonitoring);
router.get('/dashboard', authMiddleware, dssController.getDashboardAnalytics);
router.get('/sumber-dana', authMiddleware, dssController.getSumberDana);
router.put('/talangan-sumber/:id', authMiddleware, talanganController.assignSumberTalangan);
router.get('/logs', authMiddleware, dssController.getLogs);
router.post('/pagu', authMiddleware, dssController.upsertPagu);

// Intelligence & Predictive Routes
router.get('/intelligence/report', authMiddleware, intelligenceController.getIntelligenceReport);
router.post('/intelligence/chat', authMiddleware, intelligenceController.chatWithAI);

// Simulator & Projections
router.get('/simulator/scenarios', authMiddleware, simulatorController.getScenarios);
router.post('/simulator/scenarios', authMiddleware, simulatorController.saveScenario);
router.delete('/simulator/scenarios/:id', authMiddleware, simulatorController.deleteScenario);
router.get('/simulator/projections', authMiddleware, simulatorController.getProjections);
router.post('/simulator/projections', authMiddleware, simulatorController.upsertProjection);

// New Accounting Features
router.get('/tax-monitoring', authMiddleware, reportController.getTaxMonitoring);
router.get('/general-ledger', authMiddleware, reportController.getGeneralLedger);

// Penyesuaian
router.get('/penyesuaian', authMiddleware, penyesuaianController.getPenyesuaianList);
router.post('/penyesuaian', authMiddleware, penyesuaianController.createPenyesuaian);

// Saldo Awal
router.get('/saldo-awal', authMiddleware, saldoAwalController.getSaldoAwalList);
router.post('/saldo-awal', authMiddleware, saldoAwalController.saveSaldoAwal);

// Talangan
router.post('/talangan/:id/split', authMiddleware, talanganController.splitTalangan);
router.post('/talangan/:id/settle', authMiddleware, talanganController.settleTalanganManual);
router.get('/talangan/anomalies', authMiddleware, talanganController.getTalanganAnomalies);
router.post('/talangan/fix-anomalies', authMiddleware, talanganController.fixTalanganAnomalies);
router.post('/talangan/auto-settle-by-balance', authMiddleware, talanganController.autoSettleByBalance);
router.get('/talangan', authMiddleware, talanganController.getTalanganList);
router.post('/talangan/bulk-settle', authMiddleware, talanganController.bulkSettleTalangan);
router.post('/talangan', authMiddleware, talanganController.createTalanganManual);
// Setoran Pajak
router.get('/setoran-pajak', authMiddleware, setoranPajakController.getSetoranPajakList);
router.post('/setoran-pajak', authMiddleware, setoranPajakController.createSetoranPajak);
router.put('/setoran-pajak/:id', authMiddleware, setoranPajakController.updateSetoranPajak);
router.delete('/setoran-pajak/:id', authMiddleware, setoranPajakController.deleteSetoranPajak);

module.exports = router;
