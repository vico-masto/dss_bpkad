const prisma = require('../prismaClient');

/**
 * Mendapatkan Daftar Sumber Dana
 */
const getSumberDana = async (req, res) => {
  try {
    const data = await prisma.master_sumber_dana.findMany({ orderBy: { id: 'asc' } });
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: 'Server Error', error: err.message });
  }
};

/**
 * Mendapatkan Log Aktivitas
 */
const getLogs = async (req, res) => {
  try {
    const data = await prisma.log_aktivitas.findMany({
      orderBy: { created_at: 'desc' },
      take: 100
    });
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: 'Server Error', error: err.message });
  }
};

/**
 * Mendapatkan Dashboard Analytics (Sederhana)
 */
const getDashboardAnalytics = async (req, res) => {
  try {
    const [inc, exp, adjIn, adjOut, tal] = await Promise.all([
      prisma.data_pendapatan.aggregate({ _sum: { nilai: true } }),
      prisma.detail_sp2d.aggregate({ _sum: { nilai_neto: true } }),
      prisma.data_penyesuaian.aggregate({ where: { jenis: 'MASUK' }, _sum: { nilai: true } }),
      prisma.data_penyesuaian.aggregate({ where: { jenis: 'KELUAR' }, _sum: { nilai: true } }),
      prisma.jurnal_talangan.aggregate({ where: { status: 'BELUM' }, _sum: { nilai: true } })
    ]);

    const kasFisik = 
      Number(inc._sum.nilai || 0) - 
      Number(exp._sum.nilai_neto || 0) + 
      Number(adjIn._sum.nilai || 0) - 
      Number(adjOut._sum.nilai || 0);
    
    const totalTalangan = Number(tal._sum.nilai || 0);

    res.json({
      summary: {
        kasFisik,
        totalTalangan,
        kasEfektif: kasFisik - totalTalangan
      }
    });
  } catch (err) {
    res.status(500).json({ message: 'Server Error', error: err.message });
  }
};

/**
 * Upsert Pagu OPD
 */
const upsertPagu = async (req, res) => {
  const { tahun, opd, id_sumber_dana, nilai, jenis } = req.body;
  const targetOpd = opd || 'APBD KESELURUHAN';
  const targetSource = id_sumber_dana || 'SD-ALL';
  const targetJenis = jenis || 'MURNI';

  try {
    // master_pagu composite key: (tahun, opd, id_sumber_dana, jenis)
    const result = await prisma.master_pagu.upsert({
      where: {
        tahun_opd_id_sumber_dana_jenis: {
          tahun: parseInt(tahun),
          opd: targetOpd,
          id_sumber_dana: targetSource,
          jenis: targetJenis
        }
      },
      update: { nilai: parseFloat(nilai) },
      create: {
        tahun: parseInt(tahun),
        opd: targetOpd,
        id_sumber_dana: targetSource,
        nilai: parseFloat(nilai),
        jenis: targetJenis
      }
    });
    res.json(result);
  } catch (err) {
    console.error('UPSERT PAGU ERROR:', err);
    res.status(500).json({ message: 'Server Error', error: err.message });
  }
};

module.exports = {
  getSumberDana,
  getLogs,
  getDashboardAnalytics,
  upsertPagu
};
