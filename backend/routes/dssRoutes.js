const express = require('express');
const router = express.Router();
const dssController = require('../controllers/dssController');
const penyesuaianController = require('../controllers/penyesuaianController');
const saldoAwalController = require('../controllers/saldoAwalController');
const talanganController = require('../controllers/talanganController');
const setoranPajakController = require('../controllers/setoranPajakController');
const simulatorController = require('../controllers/simulatorController');
const intelligenceController = require('../controllers/intelligenceController');
const lraController = require('../controllers/lraController');
const upload = require('../config/multer');
const authMiddleware = require('../middleware/authMiddleware');
const checkRole = require('../middleware/roleMiddleware');
const { backfillHandler } = require('../services/potonganSyncService');

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
router.post('/simulator/run', authMiddleware, simulatorController.runSimulation);
router.get('/simulator/auto-project', authMiddleware, simulatorController.autoProjectInflow);
router.get('/simulator/auto-project-outflow', authMiddleware, simulatorController.autoProjectOutflow);

// New Accounting Features
router.get('/tax-monitoring', authMiddleware, reportController.getTaxMonitoring);
router.get('/general-ledger', authMiddleware, reportController.getGeneralLedger);

// Penyesuaian (CRUD Lengkap)
router.get('/penyesuaian', authMiddleware, penyesuaianController.getPenyesuaianList);
router.post('/penyesuaian', authMiddleware, penyesuaianController.createPenyesuaian);
router.get('/penyesuaian/:id', authMiddleware, penyesuaianController.getPenyesuaianById);
router.put('/penyesuaian/:id', authMiddleware, penyesuaianController.updatePenyesuaian);
router.delete('/penyesuaian/:id', authMiddleware, penyesuaianController.deletePenyesuaian);

// Saldo Awal
router.get('/saldo-awal', authMiddleware, saldoAwalController.getSaldoAwalList);
router.post('/saldo-awal', authMiddleware, saldoAwalController.saveSaldoAwal);

// Data LRA
router.get('/lra', authMiddleware, lraController.getLRAList);
router.post('/lra', authMiddleware, lraController.upsertLRA);
router.post('/lra/upload', authMiddleware, upload.single('file'), lraController.uploadLRA);
router.delete('/lra/all', authMiddleware, lraController.deleteAllLRA);
router.delete('/lra/:id', authMiddleware, lraController.deleteLRA);


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
// [INVARIANT] Backfill rincian potongan utk header manual yang kosong (admin-only)
router.get('/admin/backfill-potongan-manual', authMiddleware, checkRole(['admin', 'ADMIN']), backfillHandler);
// [WIZARD IMPOR] Status 4 langkah + finalisasi status dana
router.get('/impor-status', authMiddleware, dssController.getImporStatus);
router.get('/impor-preview', authMiddleware, dssController.getImporPreview);
router.post('/finalisasi-status-dana', authMiddleware, dssController.finalisasiStatusDana);
router.patch('/mengendap/:id', authMiddleware, checkRole(['admin', 'ADMIN']), dssController.updateMengendapStatus);
router.put('/setoran-pajak/bulk-jenis', authMiddleware, setoranPajakController.bulkUpdateJenisPajak);
router.put('/setoran-pajak/:id', authMiddleware, setoranPajakController.updateSetoranPajak);
router.delete('/setoran-pajak/:id', authMiddleware, setoranPajakController.deleteSetoranPajak);

module.exports = router;
