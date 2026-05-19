const prisma = require('../prismaClient');

/**
 * Mendapatkan saldo real-time per Sumber Dana
 * Menggabungkan Pendapatan, SP2D, Penyesuaian, dan Saldo Awal
 */
const getRealTimeBalance = async (idSumberDana, tx = null) => {
  const currentYear = new Date().getFullYear();
  const client = tx || prisma;

  // Ambil semua komponen saldo secara paralel
  const [saldoAwal, totalPendapatan, totalSp2d, totalPenyesuaianMasuk, totalPenyesuaianKeluar] = await Promise.all([
    client.saldo_awal.findFirst({
      where: { id_sumber_dana: idSumberDana, tahun: currentYear },
      select: { nilai: true }
    }),
    client.data_pendapatan.aggregate({
      where: { id_sumber_dana: idSumberDana },
      _sum: { nilai: true }
    }),
    client.$queryRaw`
      SELECT SUM(
        CASE
          -- SP2D dibayar bruto (diketahui saat rekonsiliasi bank): kas keluar = bruto penuh
          WHEN h.status_rekon = 'SUDAH_BRUTO' THEN d.nilai_bruto
          -- SP2D belum/sudah rekon neto: kas keluar = bruto dikurangi potongan
          -- Gunakan rincian manual jika ada, fallback ke gelondongan header
          ELSE d.nilai_bruto - (
            COALESCE(
              (SELECT SUM(p.nilai) FROM data_sp2d_potongan p
               WHERE p.id_sp2d = h.id AND (p.keterangan IS NULL OR p.keterangan != 'AUTO_HEADER')),
              CAST(h.nilai_potongan AS DECIMAL)
            ) * (d.nilai_bruto / NULLIF(h.nilai_bruto, 0))
          )
        END
      ) as total
      FROM detail_sp2d d JOIN data_sp2d h ON d.id_sp2d = h.id
      WHERE d.id_sumber_dana = ${idSumberDana}
    `,
    client.data_penyesuaian.aggregate({
      where: { id_sumber_dana: idSumberDana, jenis: 'MASUK' },
      _sum: { nilai: true }
    }),
    client.data_penyesuaian.aggregate({
      where: { id_sumber_dana: idSumberDana, jenis: 'KELUAR' },
      _sum: { nilai: true }
    })
  ]);

  const balance = 
    (Number(saldoAwal?.nilai || 0)) +
    (Number(totalPendapatan._sum.nilai || 0)) -
    (Number(totalSp2d[0]?.total || 0)) +
    (Number(totalPenyesuaianMasuk._sum.nilai || 0)) -
    (Number(totalPenyesuaianKeluar._sum.nilai || 0));

  return balance;
};

/**
 * Mendapatkan realisasi belanja per OPD dan Sumber Dana pada tahun tertentu
 */
const getRealization = async (opd, idSumberDana, tahun) => {
  const result = await prisma.$queryRaw`
    SELECT SUM(
      CASE
        WHEN h.status_rekon = 'SUDAH_BRUTO' THEN d.nilai_bruto
        ELSE d.nilai_bruto - (
          COALESCE(
            (SELECT SUM(p.nilai) FROM data_sp2d_potongan p
             WHERE p.id_sp2d = h.id AND (p.keterangan IS NULL OR p.keterangan != 'AUTO_HEADER')),
            CAST(h.nilai_potongan AS DECIMAL)
          ) * (d.nilai_bruto / NULLIF(h.nilai_bruto, 0))
        )
      END
    ) as total
    FROM detail_sp2d d JOIN data_sp2d h ON d.id_sp2d = h.id
    WHERE d.id_sumber_dana = ${idSumberDana} AND h.opd = ${opd} AND h.tahun = ${parseInt(tahun)}
  `;
  
  return Number(result[0]?.total || 0);
};

/**
 * Validasi Pagu: Realisasi + Nilai Baru <= Pagu
 */
const validatePagu = async (opd, idSumberDana, tahun, nilaiBaru) => {
  const paguResult = await prisma.master_pagu.findFirst({
    where: { 
      opd: opd, 
      id_sumber_dana: idSumberDana, 
      tahun: parseInt(tahun) 
    }
  });
  
  if (!paguResult) {
    return { valid: true, warning: 'Pagu tidak ditemukan, validasi dilewati' };
  }

  const pagu = Number(paguResult.nilai);
  const currentRealization = await getRealization(opd, idSumberDana, tahun);

  if (currentRealization + nilaiBaru > pagu) {
    return { 
      valid: false, 
      message: `Pagu Anggaran Tidak Mencukupi! Sisa pagu: Rp ${(pagu - currentRealization).toLocaleString('id-ID')} | Kebutuhan: Rp ${nilaiBaru.toLocaleString('id-ID')}`,
      sisaPagu: pagu - currentRealization
    };
  }

  return { valid: true };
};

/**
 * Validasi Likuiditas: Saldo >= Nilai Baru
 */
const validateLikuiditas = async (idSumberDana, nilaiBaru) => {
  const currentBalance = await getRealTimeBalance(idSumberDana);

  if (currentBalance < nilaiBaru) {
    return { 
      valid: false, 
      message: 'Saldo kas tidak mencukupi untuk pembayaran ini.',
      currentBalance,
      needsConfirmTalangan: true 
    };
  }

  return { valid: true };
};

/**
 * Auto-settlement talangan saat ada pendapatan masuk
 */
const processAutoSettlement = async (idSumberDana) => {
  const currentBalance = await getRealTimeBalance(idSumberDana);
  
  if (currentBalance >= 0) {
    // 1. Ambil jurnal talangan yang belum selesai untuk sumber dana ini
    const talanganItems = await prisma.jurnal_talangan.findMany({
      where: { id_sumber_asli: idSumberDana, status: 'BELUM' }
    });

    for (const talangan of talanganItems) {
      await prisma.$transaction(async (tx) => {
        // Selesaikan Jurnal
        await tx.jurnal_talangan.update({
          where: { id: talangan.id },
          data: { status: 'SELESAI', tanggal_selesai: new Date() }
        });
        
        // Update status SP2D terkait
        if (talangan.no_referensi) {
          const stillOutstanding = await tx.jurnal_talangan.count({
            where: { no_referensi: talangan.no_referensi, status: 'BELUM' }
          });

          if (stillOutstanding === 0) {
            await tx.data_sp2d.updateMany({
              where: { nomor: talangan.no_referensi },
              data: { status_dana: 'Aman' }
            });
          }
        }
      });
    }

    // 2. Cleanup status SP2D yang sudah tidak punya talangan outstanding
    const outstandingRefs = await prisma.jurnal_talangan.findMany({
      where: { status: 'BELUM' },
      select: { no_referensi: true }
    });
    const refList = outstandingRefs.map(t => t.no_referensi).filter(Boolean);

    await prisma.data_sp2d.updateMany({
      where: {
        status_dana: 'Talangan',
        NOT: {
          nomor: { in: refList }
        }
      },
      data: { status_dana: 'Aman' }
    });
    
    return { settledCount: talanganItems.length };
  }
  
  return { settledCount: 0 };
};

/**
 * Predictive Intelligence: Trend Analysis
 */
const getTrendAnalysis = async () => {
  const result = await prisma.$queryRaw`
    SELECT 
      EXTRACT(MONTH FROM tanggal) as bulan,
      EXTRACT(YEAR FROM tanggal) as tahun,
      SUM(CASE WHEN tipe = 'MASUK' THEN nilai ELSE 0 END) as pendapatan,
      SUM(CASE WHEN tipe = 'KELUAR' THEN nilai ELSE 0 END) as pengeluaran
    FROM (
      SELECT tanggal, nilai, 'MASUK' as tipe FROM data_pendapatan
      UNION ALL
      SELECT tanggal, nilai_neto as nilai, 'KELUAR' as tipe FROM data_sp2d
    ) combined
    WHERE tanggal >= CURRENT_DATE - INTERVAL '6 months'
    GROUP BY tahun, bulan
    ORDER BY tahun DESC, bulan DESC
  `;
  return result;
};

/**
 * Liquidity Health Score (LHS)
 */
const getLiquidityHealthScore = async (tahun) => {
  const currentYear = tahun ? parseInt(tahun) : new Date().getFullYear();
  
  // Get all sources to calculate total cash
  const sources = await prisma.master_sumber_dana.findMany({ select: { id: true } });
  let totalKasValue = 0;
  for (const s of sources) {
    totalKasValue += await getRealTimeBalance(s.id);
  }

  const [totalPagu, currentRealization] = await Promise.all([
    prisma.master_pagu.aggregate({
      where: { tahun: currentYear },
      _sum: { nilai: true }
    }),
    prisma.$queryRaw`
      SELECT SUM(CASE WHEN h.status_rekon = 'SUDAH_BRUTO' THEN d.nilai_bruto ELSE (d.nilai_bruto - (COALESCE((SELECT SUM(p.nilai) FROM data_sp2d_potongan p WHERE p.id_sp2d = h.id AND (p.keterangan IS NULL OR p.keterangan != 'AUTO_HEADER')), CAST(h.nilai_potongan AS DECIMAL)) * (d.nilai_bruto / NULLIF(h.nilai_bruto, 0)))) END) as total
      FROM detail_sp2d d JOIN data_sp2d h ON d.id_sp2d = h.id
      WHERE h.tahun = ${currentYear}
    `
  ]);
  
  const kas = totalKasValue;
  const paguSisa = Number(totalPagu._sum.nilai || 0) - Number(currentRealization[0]?.total || 0);
  
  const lcr = paguSisa > 0 ? (kas / paguSisa) * 100 : 100;
  let score = Math.min(100, lcr);
  let status = score > 70 ? 'EXCELLENT' : score > 40 ? 'GOOD' : 'CRITICAL';
  
  return { score: Math.round(score), status, kas, paguSisa };
};

/**
 * Audit Automation
 */
const runAuditCompliance = async () => {
  const anomalies = [];
  
  // 1. Cek SP2D tanpa detail sumber dana
  const noDetailCount = await prisma.data_sp2d.count({
    where: {
      details: { none: {} }
    }
  });
  
  if (noDetailCount > 0) {
    anomalies.push({ type: 'DATA_INTEGRITY', message: `${noDetailCount} SP2D tidak memiliki detail sumber dana`, level: 'HIGH' });
  }

  return anomalies;
};

/**
 * Soft Migration Helpers
 */
const getOpdIdByName = async (name) => {
  if (!name) return null;
  const result = await prisma.master_opd.findFirst({
    where: { nama: { contains: name.trim(), mode: 'insensitive' } },
    select: { nama: true }
  });
  return result ? result.nama : name;
};

const getSumberDanaIdByName = async (name) => {
  if (!name) return null;
  const n = name.trim().toUpperCase();
  
  const mapping = {
    'DAU': 'SD-DAU',
    'PAD': 'SD-PAD',
    'DAK FISIK': 'SD-DAKF',
    'DAK NON FISIK': 'SD-DAKNF',
    'DBH': 'SD-DBH',
    'SILPA': 'SD-SILPA',
    'LLPAD': 'SD-LLPAD',
    'DAU SG': 'SD-DAU SG'
  };

  if (mapping[n]) return mapping[n];

  const result = await prisma.master_sumber_dana.findFirst({
    where: {
      OR: [
        { nama: { contains: n, mode: 'insensitive' } },
        { id: { contains: n, mode: 'insensitive' } }
      ]
    },
    select: { id: true }
  });
  return result ? result.id : name;
};

module.exports = {
  getRealTimeBalance,
  getRealization,
  validatePagu,
  validateLikuiditas,
  processAutoSettlement,
  getTrendAnalysis,
  getLiquidityHealthScore,
  runAuditCompliance,
  getOpdIdByName,
  getSumberDanaIdByName
};
