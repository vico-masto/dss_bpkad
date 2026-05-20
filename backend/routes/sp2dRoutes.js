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

// Middleware untuk cek role Operator SP2D atau Admin
const operatorSp2dOrAdminOnly = (req, res, next) => {
  if (req.user.role !== 'admin' && req.user.role !== 'Operator SP2D') {
    return res.status(403).json({ message: 'Akses ditolak. Rute ini khusus Operator SP2D atau Admin.' });
  }
  next();
};

// Middleware untuk cek role Admin saja
const adminOnly = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Akses ditolak. Rute ini khusus Admin.' });
  }
  next();
};

router.put('/koreksi/:id', authMiddleware, operatorSp2dOrAdminOnly, updateSp2d);
router.post('/', authMiddleware, operatorSp2dOrAdminOnly, upload.single('file'), createSp2d);
router.get('/', authMiddleware, operatorSp2dOrAdminOnly, getSp2dList);
router.get('/check-nomor', authMiddleware, operatorSp2dOrAdminOnly, checkSp2dNomor);
router.get('/opd', authMiddleware, operatorSp2dOrAdminOnly, getOpdList);
router.get('/distinct-opd', authMiddleware, operatorSp2dOrAdminOnly, getDistinctOpd);
router.get('/jenis', authMiddleware, operatorSp2dOrAdminOnly, getJenisList);
router.get('/potongan-count', authMiddleware, adminOnly, getPotonganCount);
router.post('/import-potongan-manual', authMiddleware, adminOnly, importPotonganManual);
router.post('/import-excel-pajak', authMiddleware, adminOnly, upload.single('file'), importExcelPajak);
router.put('/potongan/:id', authMiddleware, adminOnly, updatePotongan);
router.post('/potongan/bulk-delete', authMiddleware, adminOnly, bulkDeletePotongan);
router.delete('/potongan-bulan', authMiddleware, adminOnly, deletePotonganByMonth);
router.delete('/potongan/:id', authMiddleware, adminOnly, deletePotongan);

// Kelengkapan Tanggal Pencairan — harus sebelum /:id
router.get('/missing-pencairan/stats', authMiddleware, adminOnly, getMissingPencairanStats);
router.get('/missing-pencairan', authMiddleware, adminOnly, getMissingPencairan);
router.put('/missing-pencairan/bulk', authMiddleware, adminOnly, updateTanggalPencairanBulk);

// Audit Potongan: Gelondongan vs Rincian Manual — harus sebelum /:id
router.get('/selisih-potongan/stats', authMiddleware, adminOnly, getSelisihPotonganStats);
router.get('/selisih-potongan', authMiddleware, adminOnly, getSelisihPotongan);

// Restore Tanggal Pencairan — harus sebelum /:id
router.get('/restore-tanggal-pencairan/preview', authMiddleware, adminOnly, restoreTanggalPencairanPreview);
router.post('/restore-tanggal-pencairan', authMiddleware, adminOnly, restoreTanggalPencairan);

// Fix AUTO_HEADER redundant — harus sebelum /:id
router.post('/fix-autoheader-potongan', authMiddleware, adminOnly, fixAutoHeaderPotongan);

router.get('/:id', authMiddleware, operatorSp2dOrAdminOnly, getSp2dById);
router.put('/koreksi/:id', authMiddleware, operatorSp2dOrAdminOnly, updateSp2d);
router.put('/:id', authMiddleware, operatorSp2dOrAdminOnly, upload.single('file'), updateSp2d);
router.delete('/:id', authMiddleware, operatorSp2dOrAdminOnly, deleteSp2d);
router.patch('/rekon/:id', authMiddleware, operatorSp2dOrAdminOnly, updateSp2dRekon);
router.get('/rekon/sync-bank/:id', authMiddleware, operatorSp2dOrAdminOnly, syncSp2dWithBank);

module.exports = router;
