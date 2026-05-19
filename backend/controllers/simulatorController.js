const prisma = require('../prismaClient');

/**
 * Get all saved scenarios
 */
const getScenarios = async (req, res) => {
  try {
    const data = await prisma.simulator_scenarios.findMany({
      orderBy: { updated_at: 'desc' }
    });
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: 'Server Error', error: err.message });
  }
};

/**
 * Save or update a scenario
 */
const saveScenario = async (req, res) => {
  const { id, name, items } = req.body;
  try {
    if (id) {
      const result = await prisma.simulator_scenarios.update({
        where: { id: id },
        data: {
          name,
          items: items, // Prisma handles JSON automatically if defined as Json in schema
          updated_at: new Date()
        }
      });
      return res.json(result);
    } else {
      const result = await prisma.simulator_scenarios.create({
        data: {
          name,
          items: items
        }
      });
      return res.json(result);
    }
  } catch (err) {
    res.status(500).json({ message: 'Server Error', error: err.message });
  }
};

/**
 * Delete a scenario
 */
const deleteScenario = async (req, res) => {
  const { id } = req.params;
  try {
    await prisma.simulator_scenarios.delete({
      where: { id: id }
    });
    res.json({ message: 'Scenario deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Server Error', error: err.message });
  }
};

/**
 * Get Revenue Projections
 */
const getProjections = async (req, res) => {
  const { tahun } = req.query;
  const targetTahun = parseInt(tahun) || new Date().getFullYear();
  try {
    const data = await prisma.proyeksi_pendapatan.findMany({
      where: { tahun: targetTahun },
      include: {
        master_sumber_dana: {
          select: { nama: true }
        }
      },
      orderBy: { bulan: 'asc' }
    });

    const formatted = data.map(p => ({
      ...p,
      sumber_dana_nama: p.master_sumber_dana?.nama
    }));

    res.json(formatted);
  } catch (err) {
    res.status(500).json({ message: 'Server Error', error: err.message });
  }
};

/**
 * Add or update projection
 */
const upsertProjection = async (req, res) => {
  const { id, bulan, tahun, id_sumber_dana, nilai, keterangan } = req.body;
  try {
    if (id) {
      const result = await prisma.proyeksi_pendapatan.update({
        where: { id: parseInt(id) },
        data: {
          bulan: parseInt(bulan),
          tahun: parseInt(tahun),
          id_sumber_dana,
          nilai: parseFloat(nilai),
          keterangan
        }
      });
      res.json(result);
    } else {
      const result = await prisma.proyeksi_pendapatan.create({
        data: {
          bulan: parseInt(bulan),
          tahun: parseInt(tahun),
          id_sumber_dana,
          nilai: parseFloat(nilai),
          keterangan
        }
      });
      res.json(result);
    }
  } catch (err) {
    res.status(500).json({ message: 'Server Error', error: err.message });
  }
};

module.exports = {
  getScenarios,
  saveScenario,
  deleteScenario,
  getProjections,
  upsertProjection
};
