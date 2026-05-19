const express = require('express');
const router = express.Router();
const { 
  login, 
  register, 
  updatePin, 
  getUsers, 
  changePassword, 
  resetUserPassword,
  deleteUser
} = require('../controllers/authController');
const authMiddleware = require('../middleware/authMiddleware');

router.post('/login', login);
router.post('/register', authMiddleware, register); // Only logged in users (admin) can register others
router.post('/update-pin', authMiddleware, updatePin);
router.get('/users', authMiddleware, getUsers);
router.post('/change-password', authMiddleware, changePassword);
router.put('/users/:id/password', authMiddleware, resetUserPassword);
router.delete('/users/:id', authMiddleware, deleteUser);

module.exports = router;
