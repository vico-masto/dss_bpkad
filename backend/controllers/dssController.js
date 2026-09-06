const prisma = require('../prismaClient');
const dssService = require('../services/dssService');

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

// ══════════════════════════════════════════════════════════════════════════════
// WIZARD IMPOR TERPANDU — status 4 langkah + finalisasi status dana
// ══════════════════════════════════════════════════════════════════════════════
const getImporStatus = async (req, res) => {
  const tahun = parseInt(req.query.tahun) || new Date().getFullYear();
  const bulan = parseInt(req.query.bulan);
  if (!bulan || bulan < 1 || bulan > 12) {
    return res.status(400).json({ message: 'Parameter bulan tidak valid (1-12)' });
  }
  try {
    const [sp2d, potongan, pendapatan, setoran, rkud] = await Promise.all([
      prisma.$queryRaw`SELECT COUNT(*)::int AS n FROM data_sp2d
        WHERE tahun = ${tahun} AND EXTRACT(MONTH FROM COALESCE(tanggal_pencairan, tanggal)) = ${bulan}`,
      prisma.$queryRaw`
        SELECT COUNT(*)::int AS n,
               COUNT(*) FILTER (WHERE COALESCE(p.status_rekon,'') LIKE '%SUDAH%')::int AS sudah
        FROM data_sp2d_potongan p LEFT JOIN data_sp2d s ON p.id_sp2d = s.id
        WHERE EXTRACT(YEAR FROM COALESCE(p.tanggal_pencairan, s.tanggal_pencairan, s.tanggal)) = ${tahun}
          AND EXTRACT(MONTH FROM COALESCE(p.tanggal_pencairan, s.tanggal_pencairan, s.tanggal)) = ${bulan}
          AND COALESCE(p.keterangan, '') != 'AUTO_HEADER'`,
      prisma.$queryRaw`SELECT COUNT(*)::int AS n FROM data_pendapatan
        WHERE tahun = ${tahun} AND EXTRACT(MONTH FROM tanggal) = ${bulan}`,
      prisma.$queryRaw`SELECT COUNT(*)::int AS n FROM setoran_pajak
        WHERE EXTRACT(YEAR FROM tanggal) = ${tahun} AND EXTRACT(MONTH FROM tanggal) = ${bulan}`,
      prisma.$queryRaw`SELECT COUNT(*)::int AS n FROM bank_statement
        WHERE EXTRACT(YEAR FROM tanggal) = ${tahun} AND EXTRACT(MONTH FROM tanggal) = ${bulan}`
    ]);
    const n = (r) => Number(r[0]?.n || 0);
    const sudah = Number(potongan[0]?.sudah || 0);
    res.json({
      tahun, bulan,
      steps: {
        sp2d:       { count: n(sp2d),       done: n(sp2d) > 0 },
        potongan:   { count: n(potongan),   done: n(potongan) > 0, sudahAkanTerhapus: sudah },
        pendapatan: { count: n(pendapatan), done: n(pendapatan) > 0 },
        setoran:    { count: n(setoran),    done: n(setoran) > 0 },
        rkud:       { count: n(rkud),       done: n(rkud) > 0 }
      }
    });
  } catch (err) {
    console.error('[IMPOR-STATUS]', err.message);
    res.status(500).json({ message: 'Gagal memuat status impor', error: err.message });
  }
};

/**
 * Finalisasi Status Dana bulanan — mereplikasi PERSIS logika updateSp2d:
 * per detail: getRealTimeBalance < nilai_bruto - 0.01 → 'Talangan', selain itu 'Aman'.
 * Sinkron jurnal_talangan: hapus TLG BELUM milik nomor bila tidak lagi memenuhi;
 * buat/pertahankan bila header tetap Talangan dan saldo detail minus.
 */
const finalisasiStatusDana = async (req, res) => {
  const tahun = parseInt(req.query.tahun) || new Date().getFullYear();
  const bulan = parseInt(req.query.bulan);
  if (!bulan || bulan < 1 || bulan > 12) {
    return res.status(400).json({ message: 'Bulan tidak valid (1-12)' });
  }
  const actor = req.user?.username || 'SYSTEM';
  try {
    const headers = await prisma.$queryRaw`
      SELECT id::text AS id, nomor FROM data_sp2d
      WHERE tahun = ${tahun} AND EXTRACT(MONTH FROM COALESCE(tanggal_pencairan, tanggal)) = ${bulan}`;

    // Pre-fetch saldo tiap sumber dana SEKALI (dataset statis selama proses)
    const sdRows = await prisma.$queryRaw`
      SELECT DISTINCT d.id_sumber_dana AS sd FROM detail_sp2d d JOIN data_sp2d h ON d.id_sp2d = h.id
      WHERE h.tahun = ${tahun} AND EXTRACT(MONTH FROM COALESCE(h.tanggal_pencairan, h.tanggal)) = ${bulan}
        AND d.id_sumber_dana IS NOT NULL`;
    const balances = {};
    for (const r of sdRows) {
      balances[r.sd] = await dssService.getRealTimeBalance(r.sd);
    }

    let aman = 0, talangan = 0, jurnalDibersihkan = 0, jurnalDitambah = 0;
    for (const h of headers) {
      const details = await prisma.detail_sp2d.findMany({
        where: { id_sp2d: h.id }, select: { id_sumber_dana: true, nilai_bruto: true, nilai_neto: true }
      });
      let isTalangan = false;
      for (const d of details) {
        if (!d.id_sumber_dana) continue;
        const bal = balances[d.id_sumber_dana];
        if (bal != null && bal < (parseFloat(d.nilai_bruto) - 0.01)) { isTalangan = true; break; }
      }
      const newStatus = isTalangan ? 'Talangan' : 'Aman';
      if ((h.status_dana || '') !== newStatus) {
        await prisma.data_sp2d.update({ where: { id: h.id }, data: { status_dana: newStatus } });
      }
      isTalangan ? talangan++ : aman++;

      // Sinkron jurnal talangan
      const tlg = await prisma.jurnal_talangan.findMany({
        where: { no_referensi: h.nomor, status: 'BELUM' },
        select: { id: true, id_sumber_asli: true }
      });
      if (!isTalangan && tlg.length > 0) {
        await prisma.jurnal_talangan.deleteMany({ where: { id: { in: tlg.map(t => t.id) } } });
        jurnalDibersihkan += tlg.length;
      } else if (isTalangan) {
        for (const d of details) {
          if (!d.id_sumber_dana) continue;
          const bal = balances[d.id_sumber_dana];
          if (bal == null || bal >= 0) continue;
          if (tlg.some(t => t.id_sumber_asli === d.id_sumber_dana)) continue;
          await prisma.jurnal_talangan.create({ data: {
            id: `TLG-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            tanggal: new Date(),
            no_referensi: h.nomor,
            uraian: `Finalisasi Talangan SP2D ${h.nomor}`,
            id_sumber_asli: d.id_sumber_dana,
            id_sumber_talangan: 'SD-SILPA',
            nilai: parseFloat(d.nilai_neto),
            status: 'BELUM'
          }});
          jurnalDitambah++;
        }
      }
    }

    await prisma.log_aktivitas.create({ data: {
      user_pelaksana: actor, aksi: 'FINALISASI_STATUS_DANA',
      detail: `Bulan ${bulan}/${tahun}: Aman=${aman}, Talangan=${talangan}, jurnal dibersihkan=${jurnalDibersihkan}, ditambah=${jurnalDitambah}`
    }}).catch(() => {});

    res.json({ message: 'Finalisasi status dana selesai',
      hasil: { total_header: headers.length, aman, talangan, jurnal_dibersihkan: jurnalDibersihkan, jurnal_ditambah: jurnalDitambah } });
  } catch (err) {
    console.error('[FINALISASI-DANA]', err);
    res.status(500).json({ message: 'Gagal finalisasi status dana', error: err.message });
  }
};

/**
 * Pratinjau baris per komponen utk panel Kelola Data wizard impor terpadu
 */
const getImporPreview = async (req, res) => {
  const tahun = parseInt(req.query.tahun) || new Date().getFullYear();
  const bulan = parseInt(req.query.bulan);
  const komponen = String(req.query.komponen || '');
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  if (!bulan || bulan < 1 || bulan > 12 || !['sp2d','potongan','pendapatan','rkud'].includes(komponen)) {
    return res.status(400).json({ message: 'Parameter tidak valid' });
  }
  try {
    let rows;
    if (komponen === 'sp2d') {
      rows = await prisma.$queryRaw`SELECT id::text AS id, COALESCE(tanggal_pencairan, tanggal)::date AS tanggal,
        nomor AS ref, uraian, nilai_bruto::float8 AS nilai, status_rekon AS status
        FROM data_sp2d WHERE tahun=${tahun} AND EXTRACT(MONTH FROM COALESCE(tanggal_pencairan,tanggal))=${bulan}
        ORDER BY tanggal DESC LIMIT ${limit}`;
    } else if (komponen === 'potongan') {
      rows = await prisma.$queryRaw`SELECT p.id::text AS id, p.tanggal_pencairan::date AS tanggal,
        p.nomor_sp2d AS ref, p.uraian, p.nilai::float8 AS nilai, p.status_rekon AS status
        FROM data_sp2d_potongan p WHERE EXTRACT(YEAR FROM p.tanggal_pencairan)=${tahun}
          AND EXTRACT(MONTH FROM p.tanggal_pencairan)=${bulan}
          AND COALESCE(p.keterangan, '') != 'AUTO_HEADER'
          ORDER BY p.tanggal_pencairan DESC LIMIT ${limit}`;
    } else if (komponen === 'pendapatan') {
      rows = await prisma.$queryRaw`SELECT id::text AS id, tanggal::date AS tanggal,
        nomor_bukti AS ref, uraian, nilai::float8 AS nilai, status_rekon AS status
        FROM data_pendapatan WHERE tahun=${tahun} AND EXTRACT(MONTH FROM tanggal)=${bulan}
        ORDER BY tanggal DESC LIMIT ${limit}`;
    } else {
      rows = await prisma.$queryRaw`SELECT id::text AS id, tanggal::date AS tanggal,
        COALESCE(nomor_bukti,'') AS ref, deskripsi AS uraian,
        COALESCE(NULLIF(debet::float8,0), NULLIF(kredit::float8,0), 0) AS nilai,
        CASE WHEN is_matched THEN 'SUDAH' ELSE 'BELUM' END AS status
        FROM bank_statement WHERE EXTRACT(YEAR FROM tanggal)=${tahun} AND EXTRACT(MONTH FROM tanggal)=${bulan}
        ORDER BY tanggal DESC LIMIT ${limit}`;
    }
    res.json(rows);
  } catch (err) {
    console.error('[IMPOR-PREVIEW]', err.message);
    res.status(500).json({ message: 'Gagal memuat pratinjau', error: err.message });
  }
};

// ═══════════════════════════════════════════════════════════════════════
// Status Penyelesaian Potongan Mengendap (adminOnly)
// ═══════════════════════════════════════════════════════════════════════
// Transisi valid: MENGENDAP → DISETOR, MENGENDAP → JADI_PADAN,
// atau kembali ke MENGENDAP (koreksi). Wajib catatan.
// Hanya untuk potongan 'Lainnya' (filter di service layer / frontend guard).

const VALID_TRANSISI = {
  MENGENDAP: ['DISETOR', 'JADI_PADAN'],
  DISETOR: ['MENGENDAP'],
  JADI_PADAN: ['MENGENDAP']
};

const updateMengendapStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status_mengendap, catatan_penyelesaian } = req.body;

    if (!status_mengendap || !catatan_penyelesaian) {
      return res.status(400).json({ message: 'status_mengendap dan catatan wajib diisi.' });
    }
    if (!['MENGENDAP', 'DISETOR', 'JADI_PADAN'].includes(status_mengendap)) {
      return res.status(400).json({ message: 'Status tidak valid. Pilih: MENGENDAP, DISETOR, atau JADI_PADAN.' });
    }

    const existing = await prisma.data_sp2d_potongan.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ message: 'Potongan tidak ditemukan.' });

    const currentStatus = existing.status_mengendap || 'MENGENDAP';
    const allowed = VALID_TRANSISI[currentStatus] || [];
    if (!allowed.includes(status_mengendap)) {
      return res.status(400).json({ message: `Transisi dari ${currentStatus} ke ${status_mengendap} tidak diizinkan.` });
    }

    const now = new Date();
    await prisma.data_sp2d_potongan.update({
      where: { id },
      data: {
        status_mengendap,
        tanggal_penyelesaian: status_mengendap === 'MENGENDAP' ? null : now,
        catatan_penyelesaian: catatan_penyelesaian
      }
    });

    // Log aktivitas
    try {
      await prisma.log_aktivitas.create({
        data: {
          user_id: req.user?.id || 'system',
          aksi: 'UPDATE_STATUS_MENGENDAP',
          keterangan: `Potongan ${existing.nomor_sp2d} (${existing.uraian || '-'}): ${currentStatus} → ${status_mengendap}. Catatan: ${catatan_penyelesaian}`
        }
      });
    } catch (_) {}

    res.json({ message: `Status berhasil diubah ke ${status_mengendap}.` });
  } catch (err) {
    res.status(500).json({ message: 'Gagal mengubah status', error: err.message });
  }
};

module.exports = {
  getSumberDana,
  getLogs,
  getDashboardAnalytics,
  upsertPagu,
  getImporStatus,
  finalisasiStatusDana,
  getImporPreview,
  updateMengendapStatus
};
