const prisma = require('../prismaClient');
const dssService = require('../services/dssService');
const auditService = require('../services/auditService');

/**
 * Membuat Penyesuaian Baru (Jurnal Koreksi)
 */
const createPenyesuaian = async (req, res) => {
  const { tanggal, uraian, id_sumber_dana, nilai, jenis, sisi_pengaruh } = req.body;

  try {
    const id = `ADJ-${Date.now()}`;

    const result = await prisma.data_penyesuaian.create({
      data: {
        id,
        tanggal: new Date(tanggal),
        uraian,
        id_sumber_dana,
        nilai: parseFloat(nilai),
        jenis,
        sisi_pengaruh,
        user_pelaksana: req.user.username
      }
    });

    // Jika Jenis adalah MASUK, coba lakukan auto-settlement talangan
    let settledCount = 0;
    if (jenis === 'MASUK') {
      const settlement = await dssService.processAutoSettlement(id_sumber_dana);
      settledCount = settlement.settledCount;
    }

    // Log Aktivitas
    await auditService.logActivity(req, 'TAMBAH', 'PENYESUAIAN', `${jenis} | ${uraian} | Rp ${parseFloat(nilai).toLocaleString('id-ID')}`);

    res.status(201).json({ 
      message: 'Penyesuaian berhasil disimpan', 
      id: result.id,
      settledCount 
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: 'Server Error', error: err.message });
  }
};

const getPenyesuaianList = async (req, res) => {
  try {
    const data = await prisma.data_penyesuaian.findMany({
      orderBy: { tanggal: 'desc' },
      take: 50
    });
    res.json({ data });
  } catch (err) {
    res.status(500).json({ message: 'Server Error', error: err.message });
  }
};

module.exports = {
  createPenyesuaian,
  getPenyesuaianList
};
