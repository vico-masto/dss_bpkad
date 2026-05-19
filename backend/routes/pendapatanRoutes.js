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

router.post('/', authMiddleware, upload.single('file'), createPendapatan);
router.post('/import-bulk', authMiddleware, upload.single('file'), importBulkPendapatan);
router.get('/', authMiddleware, getPendapatanList);
router.delete('/bulk', authMiddleware, deleteMultiplePendapatan);
router.put('/:id', authMiddleware, upload.single('file'), updatePendapatan);
router.patch('/rekon/:id', authMiddleware, async (req, res) => {
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
router.delete('/:id', authMiddleware, deletePendapatan);

module.exports = router;

