const express = require('express');
const router = express.Router();
const referenceController = require('../controllers/referenceController');
const authController = require('../controllers/authController');
const systemController = require('../controllers/systemController');
const authMiddleware = require('../middleware/authMiddleware');

// Middleware untuk cek role admin
const adminOnly = (req, res, next) => {
  if (req.user.role !== 'admin') return res.status(403).json({ message: 'Akses ditolak. Khusus Admin.' });
  next();
};

// Referensi OPD
router.get('/opd', authMiddleware, adminOnly, referenceController.getOPD);
router.post('/opd', authMiddleware, adminOnly, referenceController.createOPD);
router.put('/opd/:id', authMiddleware, adminOnly, referenceController.updateOPD);
router.delete('/opd/:id', authMiddleware, adminOnly, referenceController.deleteOPD);

// Referensi Jenis Belanja
router.get('/jenis', authMiddleware, adminOnly, referenceController.getJenis);
router.post('/jenis', authMiddleware, adminOnly, referenceController.createJenis);
router.put('/jenis/:id', authMiddleware, adminOnly, referenceController.updateJenis);
router.delete('/jenis/:id', authMiddleware, adminOnly, referenceController.deleteJenis);

// Referensi Sumber Dana
router.get('/sumber-dana', authMiddleware, adminOnly, referenceController.getSumberDana);
router.post('/sumber-dana', authMiddleware, adminOnly, referenceController.createSumberDana);
router.put('/sumber-dana/:id', authMiddleware, adminOnly, referenceController.updateSumberDana);
router.delete('/sumber-dana/:id', authMiddleware, adminOnly, referenceController.deleteSumberDana);

// Manajemen User
router.post('/users/register', authMiddleware, adminOnly, authController.register);

// Pembersihan Data Masal
router.post('/purge-all-data', authMiddleware, adminOnly, systemController.purgeAllData);

// Terapkan trigger proteksi field kritis ke database
router.post('/apply-db-triggers', authMiddleware, adminOnly, systemController.applyDatabaseTriggers);

module.exports = router;
