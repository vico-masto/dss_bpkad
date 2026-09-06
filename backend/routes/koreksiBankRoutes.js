const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const authMiddleware = require('../middleware/authMiddleware');
const checkRole = require('../middleware/roleMiddleware');
const koreksiBankController = require('../controllers/koreksiBankController');

const koreksiUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const dir = path.join(process.cwd(), 'uploads', 'koreksi-bank');
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (req, file, cb) => {
      cb(null, `KB-${Date.now()}-${file.originalname}`);
    },
  }),
  fileFilter: (req, file, cb) => {
    const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];
    cb(null, allowed.includes(file.mimetype));
  },
  limits: { fileSize: 10 * 1024 * 1024 },
});

router.post('/', authMiddleware, checkRole(['admin']), koreksiUpload.single('file'), koreksiBankController.createSuratKoreksi);
router.get('/', authMiddleware, checkRole(['admin']), koreksiBankController.listSuratKoreksi);
router.get('/bank-candidates', authMiddleware, checkRole(['admin']), koreksiBankController.getBankCandidates);
router.get('/sp2d-candidates', authMiddleware, checkRole(['admin']), koreksiBankController.getSp2dCandidates);
// GET /auto-detect & /resolved-map: auth-only — data read-only yang dibutuhkan halaman
// discrepancy/BAR untuk semua user berhak melihat. Jangan di-gate admin (pernah
// menyebabkan SWR gagal diam-diam → badge DITUTUP/C.2 BAR tidak muncul utk non-admin).
router.get('/auto-detect', authMiddleware, koreksiBankController.getAutoDetectSuggestions);
router.post('/auto-detect/confirm', authMiddleware, checkRole(['admin']), koreksiBankController.confirmAutoDetect);
router.get('/resolved-map', authMiddleware, koreksiBankController.getResolvedSelisihMap);
router.get('/:id', authMiddleware, checkRole(['admin']), koreksiBankController.getSuratKoreksiById);
router.delete('/:id', authMiddleware, checkRole(['admin']), koreksiBankController.voidSuratKoreksi);

module.exports = router;
