const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const prisma = require('../prismaClient');

const login = async (req, res) => {
  const { username, password } = req.body;

  try {
    const user = await prisma.users.findUnique({
      where: { username }
    });

    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, process.env.JWT_SECRET, {
      expiresIn: '8h',
    });

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role
      }
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
};

const register = async (req, res) => {
  const { username, password, role } = req.body;

  try {
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const user = await prisma.users.create({
      data: {
        username,
        password_hash: hashedPassword,
        role: role || 'user'
      },
      select: {
        id: true,
        username: true,
        role: true
      }
    });

    res.json(user);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: err.message.includes('Unique constraint') ? 'Username sudah digunakan' : 'Gagal membuat user' });
  }
};

const updatePin = async (req, res) => {
  const { oldPin, newPin } = req.body;
  const userId = req.user.id;

  try {
    const user = await prisma.users.findUnique({
      where: { id: userId },
      select: { special_pin: true }
    });

    const currentPin = user?.special_pin;

    if (currentPin && currentPin !== oldPin) {
      return res.status(401).json({ message: 'PIN lama yang Anda masukkan salah' });
    }

    await prisma.users.update({
      where: { id: userId },
      data: { special_pin: newPin }
    });
    res.json({ message: 'PIN Khusus berhasil diperbarui' });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: 'Gagal memperbarui PIN' });
  }
};

const getUsers = async (req, res) => {
  try {
    const users = await prisma.users.findMany({
      select: {
        id: true,
        username: true,
        role: true,
        created_at: true
      },
      orderBy: [
        { role: 'asc' },
        { username: 'asc' }
      ]
    });
    res.json(users);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};

const changePassword = async (req, res) => {
  const { oldPassword, newPassword } = req.body;
  const userId = req.user.id;

  try {
    const user = await prisma.users.findUnique({
      where: { id: userId }
    });

    const isMatch = await bcrypt.compare(oldPassword, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ message: 'Password lama salah' });
    }

    const salt = await bcrypt.genSalt(10);
    const newHash = await bcrypt.hash(newPassword, salt);

    await prisma.users.update({
      where: { id: userId },
      data: { password_hash: newHash }
    });
    res.json({ message: 'Password berhasil diubah' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};

const resetUserPassword = async (req, res) => {
  const { id } = req.params;
  const { newPassword } = req.body;

  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Akses ditolak' });
  }

  try {
    const salt = await bcrypt.genSalt(10);
    const newHash = await bcrypt.hash(newPassword, salt);

    await prisma.users.update({
      where: { id: id },
      data: { password_hash: newHash }
    });
    res.json({ message: 'Password user berhasil direset' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};

const deleteUser = async (req, res) => {
  const { id } = req.params;
  if (req.user.role !== 'admin') return res.status(403).json({ message: 'Forbidden' });
  if (id === req.user.id) return res.status(400).json({ message: 'Tidak bisa menghapus diri sendiri' });

  try {
    await prisma.users.delete({
      where: { id: id }
    });
    res.json({ message: 'User berhasil dihapus' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = {
  login,
  register,
  updatePin,
  getUsers,
  changePassword,
  resetUserPassword,
  deleteUser
};
