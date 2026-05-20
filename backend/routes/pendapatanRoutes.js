const express = require('express');
const router = express.Router();
const { 
  createPendapatan, 
  getPendapatanList, 
  updatePendapatan, 
  deletePendapatan, 
  deleteMultiplePendapatan,
  importBulkPendapatan 
} = require('../controllers/pendapatanController');
const authMiddleware = require('../middleware/authMiddleware');
const upload = require('../config/multer');

// Middleware untuk cek role Operator Penerimaan atau Admin
const operatorPenerimaanOrAdminOnly = (req, res, next) => {
  if (req.user.role !== 'admin' && req.user.role !== 'Operator Penerimaan') {
    return res.status(403).json({ message: 'Akses ditolak. Rute ini khusus Operator Penerimaan atau Admin.' });
  }
  next();
};

router.post('/', authMiddleware, operatorPenerimaanOrAdminOnly, upload.single('file'), createPendapatan);
router.post('/import-bulk', authMiddleware, operatorPenerimaanOrAdminOnly, upload.single('file'), importBulkPendapatan);
router.get('/', authMiddleware, operatorPenerimaanOrAdminOnly, getPendapatanList);
router.delete('/bulk', authMiddleware, operatorPenerimaanOrAdminOnly, deleteMultiplePendapatan);
router.put('/:id', authMiddleware, operatorPenerimaanOrAdminOnly, upload.single('file'), updatePendapatan);
router.patch('/rekon/:id', authMiddleware, operatorPenerimaanOrAdminOnly, async (req, res) => {
  const { id } = req.params;
  const { status_rekon, selisih_rekon, keterangan_rekon } = req.body;
  try {
    const prisma = require('../prismaClient');
    await prisma.data_pendapatan.update({
      where: { id },
      data: { 
        status_rekon, 
        selisih_rekon: selisih_rekon !== undefined ? parseFloat(selisih_rekon) : undefined, 
        keterangan_rekon 
      }
    });
    res.json({ message: 'Rekonsiliasi pendapatan diperbarui' });
  } catch (err) {
    res.status(500).json({ message: 'Error update rekon', error: err.message });
  }
});
router.delete('/:id', authMiddleware, operatorPenerimaanOrAdminOnly, deletePendapatan);

module.exports = router;

