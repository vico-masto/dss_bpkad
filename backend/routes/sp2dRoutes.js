const express = require('express');
const router = express.Router();
const {
  createSp2d,
  getSp2dList,
  getSp2dById,
  checkSp2dNomor,
  updateSp2dRekon,
  updateSp2d,
  deleteSp2d,
  getOpdList,
  getDistinctOpd,
  getJenisList,
  syncSp2dWithBank,
  getPotonganCount,
  importPotonganManual,
  importExcelPajak,
  updatePotongan,
  deletePotongan,
  deletePotonganByMonth,
  bulkDeletePotongan,
  bulkDeleteIntegrated,
  getMissingPencairanStats,
  getMissingPencairan,
  updateTanggalPencairanBulk,
  getSelisihPotonganStats,
  getSelisihPotongan,
  restoreTanggalPencairanPreview,
  restoreTanggalPencairan,
  fixAutoHeaderPotongan,
} = require('../controllers/sp2dController');
const authMiddleware = require('../middleware/authMiddleware');

const upload = require('../config/multer');

router.put('/koreksi/:id', authMiddleware, updateSp2d);
router.post('/', authMiddleware, upload.single('file'), createSp2d);
router.get('/', authMiddleware, getSp2dList);
router.get('/check-nomor', authMiddleware, checkSp2dNomor);
router.get('/opd', authMiddleware, getOpdList);
router.get('/distinct-opd', authMiddleware, getDistinctOpd);
router.get('/jenis', authMiddleware, getJenisList);
router.get('/potongan-count', authMiddleware, getPotonganCount);
router.post('/import-potongan-manual', authMiddleware, importPotonganManual);
router.post('/import-excel-pajak', authMiddleware, upload.single('file'), importExcelPajak);
router.put('/potongan/:id', authMiddleware, updatePotongan);
router.post('/potongan/bulk-delete', authMiddleware, bulkDeletePotongan);
router.delete('/potongan-bulan', authMiddleware, deletePotonganByMonth);
router.delete('/potongan/:id', authMiddleware, deletePotongan);

// Kelengkapan Tanggal Pencairan — harus sebelum /:id
router.get('/missing-pencairan/stats', authMiddleware, getMissingPencairanStats);
router.get('/missing-pencairan', authMiddleware, getMissingPencairan);
router.put('/missing-pencairan/bulk', authMiddleware, updateTanggalPencairanBulk);

// Audit Potongan: Gelondongan vs Rincian Manual — harus sebelum /:id
router.get('/selisih-potongan/stats', authMiddleware, getSelisihPotonganStats);
router.get('/selisih-potongan', authMiddleware, getSelisihPotongan);

// Restore Tanggal Pencairan — harus sebelum /:id
router.get('/restore-tanggal-pencairan/preview', authMiddleware, restoreTanggalPencairanPreview);
router.post('/restore-tanggal-pencairan', authMiddleware, restoreTanggalPencairan);

// Fix AUTO_HEADER redundant — harus sebelum /:id
router.post('/fix-autoheader-potongan', authMiddleware, fixAutoHeaderPotongan);

router.get('/:id', authMiddleware, getSp2dById);
router.put('/koreksi/:id', authMiddleware, updateSp2d);
router.put('/:id', authMiddleware, upload.single('file'), updateSp2d);
router.delete('/:id', authMiddleware, deleteSp2d);
router.patch('/rekon/:id', authMiddleware, updateSp2dRekon);
router.get('/rekon/sync-bank/:id', authMiddleware, syncSp2dWithBank);

module.exports = router;
