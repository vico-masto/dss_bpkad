const prisma = require('../prismaClient');

// OPD CRUD
const getOPD = async (req, res) => {
  try {
    const result = await prisma.master_opd.findMany({
      orderBy: { nama: 'asc' }
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: 'Gagal mengambil data OPD', error: err.message });
  }
};

const createOPD = async (req, res) => {
  try {
    const { id, nama } = req.body;
    await prisma.master_opd.create({
      data: { id, nama, urutan: id }
    });
    res.status(201).json({ message: 'OPD berhasil ditambahkan' });
  } catch (err) {
    res.status(500).json({ 
      message: 'Gagal menambahkan OPD. Pastikan Kode/ID belum digunakan.', 
      error: err.message 
    });
  }
};

const deleteOPD = async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.master_opd.delete({
      where: { id }
    });
    res.json({ message: 'OPD berhasil dihapus' });
  } catch (err) {
    res.status(500).json({ message: 'Gagal menghapus OPD', error: err.message });
  }
};

const updateOPD = async (req, res) => {
  try {
    const { id } = req.params;
    const { nama } = req.body;
    await prisma.master_opd.update({
      where: { id },
      data: { nama }
    });
    res.json({ message: 'OPD berhasil diperbarui' });
  } catch (err) {
    res.status(500).json({ message: 'Gagal memperbarui OPD', error: err.message });
  }
};

// Jenis Belanja CRUD
const getJenis = async (req, res) => {
  try {
    const result = await prisma.master_jenis_belanja.findMany({
      orderBy: { nama: 'asc' }
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: 'Gagal mengambil data Jenis Belanja', error: err.message });
  }
};

const createJenis = async (req, res) => {
  try {
    const { id, nama } = req.body;
    await prisma.master_jenis_belanja.create({
      data: { id, nama, urutan: id }
    });
    res.status(201).json({ message: 'Jenis Belanja berhasil ditambahkan' });
  } catch (err) {
    res.status(500).json({ message: 'Gagal menambahkan Jenis Belanja', error: err.message });
  }
};

const deleteJenis = async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.master_jenis_belanja.delete({
      where: { id }
    });
    res.json({ message: 'Jenis Belanja berhasil dihapus' });
  } catch (err) {
    res.status(500).json({ message: 'Gagal menghapus Jenis Belanja', error: err.message });
  }
};

const updateJenis = async (req, res) => {
  try {
    const { id } = req.params;
    const { nama } = req.body;
    await prisma.master_jenis_belanja.update({
      where: { id },
      data: { nama }
    });
    res.json({ message: 'Jenis Belanja berhasil diperbarui' });
  } catch (err) {
    res.status(500).json({ message: 'Gagal memperbarui Jenis Belanja', error: err.message });
  }
};

// Sumber Dana CRUD
const getSumberDana = async (req, res) => {
  try {
    const result = await prisma.master_sumber_dana.findMany({
      orderBy: [
        { kategori: 'asc' },
        { id: 'asc' }
      ]
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: 'Gagal mengambil data Sumber Dana', error: err.message });
  }
};

const createSumberDana = async (req, res) => {
  try {
    const { id, nama, kategori } = req.body;
    await prisma.master_sumber_dana.create({
      data: { id, nama, kategori }
    });
    res.status(201).json({ message: 'Sumber Dana berhasil ditambahkan' });
  } catch (err) {
    res.status(500).json({ message: 'Gagal menambahkan Sumber Dana', error: err.message });
  }
};

const deleteSumberDana = async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.master_sumber_dana.delete({
      where: { id }
    });
    res.json({ message: 'Sumber Dana berhasil dihapus' });
  } catch (err) {
    res.status(500).json({ message: 'Gagal menghapus Sumber Dana', error: err.message });
  }
};

const updateSumberDana = async (req, res) => {
  try {
    const { id } = req.params;
    const { nama, kategori } = req.body;
    await prisma.master_sumber_dana.update({
      where: { id },
      data: { nama, kategori }
    });
    res.json({ message: 'Sumber Dana berhasil diperbarui' });
  } catch (err) {
    res.status(500).json({ message: 'Gagal memperbarui Sumber Dana', error: err.message });
  }
};

module.exports = {
  getOPD, createOPD, deleteOPD, updateOPD,
  getJenis, createJenis, deleteJenis, updateJenis,
  getSumberDana, createSumberDana, deleteSumberDana, updateSumberDana
};
