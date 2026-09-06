const prisma = require('../prismaClient');
const auditService = require('../services/auditService');
const { parseDateSafe } = require('../utils/dateUtils');
const { ensureRincianForSetoran } = require('../services/potonganSyncService');

/**
 * Mencatat Setoran Pajak (NTPN)
 */
const createSetoranPajak = async (req, res) => {
  const { tanggal, id_sumber_dana, nomor_bukti, uraian, nilai, opd, jenis_pajak } = req.body;

  try {
    const { skipDuplicate = false } = req.body;
    if (skipDuplicate) {
      const existing = await prisma.setoran_pajak.findUnique({ where: { nomor_bukti } });
      if (existing) {
        return res.status(200).json({ 
          message: `NTPN ${nomor_bukti} sudah terdaftar, dilewati.`, 
          skipped: true,
          id: existing.id 
        });
      }
    }

    const id = `TAX-${Date.now()}`;
    const result = await prisma.setoran_pajak.create({
      data: {
        id,
        tanggal: parseDateSafe(tanggal),
        id_sumber_dana,
        nomor_bukti,
        uraian,
        nilai: parseFloat(nilai),
        user_pelaksana: req.user?.username || 'SYSTEM',
        opd,
        jenis_pajak: jenis_pajak || 'PPN'
      }
    });

    // Log Aktivitas via auditService
    await auditService.logActivity(req, 'TAMBAH', 'SETORAN_PAJAK', `NTPN: ${nomor_bukti} | Rp ${parseFloat(nilai).toLocaleString('id-ID')}`);

    // [PARITAS MANUAL==UPLOAD] Jika nomor_bukti menunjuk header SP2D yang belum
    // punya rincian potongan → materialisasikan rincian otomatis (SUDAH, terwakili).
    const sync = await ensureRincianForSetoran(
      { id: result.id, nomor_bukti, uraian, jenis_pajak: jenis_pajak || 'PPN' },
      req.user?.username || 'SYSTEM'
    );

    res.status(201).json({ message: 'Setoran pajak berhasil direkam', id: result.id, rincian_auto_synced: sync.synced, sync_reason: sync.reason });
  } catch (err) {
    console.error('ERROR CREATE SETORAN PAJAK:', err.message);
    if (err.code === 'P2002') {
      return res.status(400).json({ 
        message: 'Gagal: Nomor NTPN / Bukti sudah terdaftar di sistem.',
        detail: 'Setiap setoran pajak harus memiliki nomor bukti yang unik.'
      });
    }
    res.status(500).json({ message: 'Server Error', error: err.message });
  }
};

const getSetoranPajakList = async (req, res) => {
  const { page = 1, limit = 10, search = '' } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(limit);
  const take = parseInt(limit);

  try {
    const where = search ? {
      OR: [
        { nomor_bukti: { contains: search, mode: 'insensitive' } },
        { uraian: { contains: search, mode: 'insensitive' } },
        { opd: { contains: search, mode: 'insensitive' } }
      ]
    } : {};

    const [data, total] = await Promise.all([
      prisma.setoran_pajak.findMany({
        where,
        orderBy: [
          { tanggal: 'desc' },
          { created_at: 'desc' }
        ],
        skip,
        take
      }),
      prisma.setoran_pajak.count({ where })
    ]);

    res.json({ 
      data, 
      pagination: {
        totalData: total,
        page: parseInt(page),
        limit: take,
        totalPages: Math.ceil(total / take)
      }
    });
  } catch (err) {
    console.error('ERROR GET SETORAN PAJAK LIST:', err.message);
    res.status(500).json({ message: 'Server Error', error: err.message });
  }
};

const updateSetoranPajak = async (req, res) => {
  const { id } = req.params;
  const { tanggal, id_sumber_dana, nomor_bukti, uraian, nilai, opd, jenis_pajak, status_rekon, selisih_rekon, keterangan_rekon } = req.body;

  try {
    const result = await prisma.setoran_pajak.update({
      where: { id },
      data: {
        tanggal: parseDateSafe(tanggal),
        id_sumber_dana,
        nomor_bukti,
        uraian,
        nilai: parseFloat(nilai),
        opd,
        jenis_pajak: jenis_pajak || 'PPN',
        status_rekon,
        selisih_rekon: selisih_rekon !== undefined ? parseFloat(selisih_rekon) : undefined,
        keterangan_rekon,
        updated_at: new Date()
      }
    });

    await auditService.logActivity(req, 'UPDATE', 'SETORAN_PAJAK', `NTPN: ${nomor_bukti} | Rp ${parseFloat(nilai).toLocaleString('id-ID')}`);

    // [PARITAS MANUAL==UPLOAD] Jika nomor_bukti diubah/diperbarui menunjuk header
    // SP2D tanpa rincian → materialisasikan rincian otomatis juga.
    const syncUpd = await ensureRincianForSetoran(
      { id, nomor_bukti, uraian, jenis_pajak: jenis_pajak || 'PPN' },
      req.user?.username || 'SYSTEM'
    );

    res.json({ message: 'Setoran pajak berhasil diperbarui', rincian_auto_synced: syncUpd.synced });
  } catch (err) {
    console.error('ERROR UPDATE SETORAN PAJAK:', err.message);
    if (err.code === 'P2002') {
      return res.status(400).json({ 
        message: 'Gagal: Nomor NTPN sudah terdaftar pada transaksi lain.',
        detail: 'NTPN harus unik untuk setiap transaksi.'
      });
    }
    if (err.code === 'P2025') {
      return res.status(404).json({ message: 'Data tidak ditemukan atau sudah dihapus' });
    }
    res.status(500).json({ message: 'Server Error', error: err.message });
  }
};

const deleteSetoranPajak = async (req, res) => {
  const { id } = req.params;

  try {
    const info = await prisma.setoran_pajak.findUnique({ where: { id } });
    if (!info) {
      return res.status(404).json({ message: 'Data tidak ditemukan' });
    }

    await prisma.setoran_pajak.delete({ where: { id } });

    // [PARITAS MANUAL==UPLOAD] Peringatan bila penghapusan meninggalkan rincian
    // auto-sync yang kini kehilangan pasangan setornya (tetap dipertahankan —
    // sejarah SUDAH; hanya informasi).
    const yatim = await prisma.$queryRaw`
      SELECT COUNT(*)::int as n FROM data_sp2d_potongan
      WHERE keterangan_rekon LIKE ${'%Auto-sync dari setoran manual ' + id + '%'}`;
    if ((yatim[0]?.n || 0) > 0) {
      await auditService.logActivity(req, 'PERINGATAN', 'SETORAN_PAJAK',
        `Hapus setoran ${info.nomor_bukti} menyisakan ${yatim[0].n} rincian auto-sync tanpa pasangan`);
    }

    await auditService.logActivity(req, 'HAPUS', 'SETORAN_PAJAK', `NTPN: ${info.nomor_bukti} | Rp ${Number(info.nilai).toLocaleString('id-ID')}`);

    res.json({ message: 'Setoran pajak berhasil dihapus' });
  } catch (err) {
    console.error('ERROR DELETE SETORAN PAJAK:', err.message);
    res.status(500).json({ message: 'Server Error', error: err.message });
  }
};

const bulkUpdateJenisPajak = async (req, res) => {
  const { dari, ke } = req.body;
  if (!ke) return res.status(400).json({ message: 'Parameter "ke" wajib diisi' });

  try {
    const where = dari ? { jenis_pajak: dari } : {};
    const result = await prisma.setoran_pajak.updateMany({
      where,
      data: { jenis_pajak: ke }
    });
    await auditService.logActivity(req, 'BULK_UPDATE', 'SETORAN_PAJAK',
      `Ganti jenis pajak: "${dari || 'SEMUA'}" → "${ke}" | ${result.count} record`);
    res.json({ message: `${result.count} record setoran pajak berhasil diperbarui`, count: result.count });
  } catch (err) {
    res.status(500).json({ message: 'Server Error', error: err.message });
  }
};

module.exports = {
  createSetoranPajak,
  getSetoranPajakList,
  updateSetoranPajak,
  deleteSetoranPajak,
  bulkUpdateJenisPajak
};
