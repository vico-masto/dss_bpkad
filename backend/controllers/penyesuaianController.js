const prisma = require('../prismaClient');
const dssService = require('../services/dssService');
const auditService = require('../services/auditService');
const { processPenyesuaianJournal } = require('../utils/accountingEngine');

const createPenyesuaian = async (req, res) => {
  const { tanggal, uraian, id_sumber_dana, nilai, jenis, sisi_pengaruh, dokumen } = req.body;

  try {
    const id = `ADJ-${Date.now()}`;

    const result = await prisma.$transaction(async (tx) => {
      const created = await tx.data_penyesuaian.create({
        data: {
          id,
          tanggal: new Date(tanggal),
          uraian,
          id_sumber_dana,
          nilai: parseFloat(nilai),
          jenis,
          sisi_pengaruh: sisi_pengaruh || 'BUKU',
          dokumen: dokumen || null,
          user_pelaksana: req.user.username
        }
      });

      // Jurnal otomatis (akrual): MASUK/KELUAR menghasilkan baris debet-kredit
      await processPenyesuaianJournal({
        id,
        tanggal,
        jenis,
        nilai,
        id_sumber_dana,
        uraian,
      }, tx);

      return created;
    });

    let settledCount = 0;
    if (jenis === 'MASUK') {
      const settlement = await dssService.processAutoSettlement(id_sumber_dana);
      settledCount = settlement.settledCount;
    }

    await auditService.logActivity(req, 'TAMBAH', 'PENYESUAIAN', `${jenis} | ${uraian} | Rp ${parseFloat(nilai).toLocaleString('id-ID')}`);

    res.status(201).json({ message: 'Penyesuaian berhasil disimpan', id: result.id, settledCount });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: 'Server Error', error: err.message });
  }
};

const getPenyesuaianList = async (req, res) => {
  try {
    const data = await prisma.data_penyesuaian.findMany({
      orderBy: { tanggal: 'desc' },
      take: 100,
      include: { master_sumber_dana: { select: { id: true, nama: true } } }
    });
    res.json({ data });
  } catch (err) {
    res.status(500).json({ message: 'Server Error', error: err.message });
  }
};

const getPenyesuaianById = async (req, res) => {
  const { id } = req.params;
  try {
    const data = await prisma.data_penyesuaian.findUnique({
      where: { id },
      include: { master_sumber_dana: { select: { id: true, nama: true } } }
    });
    if (!data) return res.status(404).json({ message: 'Data tidak ditemukan' });
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: 'Server Error', error: err.message });
  }
};

const updatePenyesuaian = async (req, res) => {
  const { id } = req.params;
  const { tanggal, uraian, id_sumber_dana, nilai, jenis, sisi_pengaruh, dokumen } = req.body;

  try {
    const existing = await prisma.data_penyesuaian.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ message: 'Data tidak ditemukan' });

    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.data_penyesuaian.update({
        where: { id },
        data: {
          tanggal: new Date(tanggal),
          uraian,
          id_sumber_dana,
          nilai: parseFloat(nilai),
          jenis,
          sisi_pengaruh: sisi_pengaruh || existing.sisi_pengaruh || 'BUKU',
          dokumen: dokumen !== undefined ? (dokumen || null) : existing.dokumen
        }
      });

      // Hapus jurnal lama lalu buat ulang (key: ref_id = id)
      await tx.jurnal_umum.deleteMany({ where: { ref_id: id } });
      await processPenyesuaianJournal({
        id,
        tanggal,
        jenis,
        nilai,
        id_sumber_dana,
        uraian,
      }, tx);

      return updated;
    });

    let settledCount = 0;
    if (jenis === 'MASUK') {
      const settlement = await dssService.processAutoSettlement(id_sumber_dana);
      settledCount = settlement.settledCount;
    }

    await auditService.logActivity(req, 'UPDATE', 'PENYESUAIAN', `ID: ${id} | ${jenis} | ${uraian} | Rp ${parseFloat(nilai).toLocaleString('id-ID')}`);

    res.json({ message: 'Penyesuaian berhasil diperbarui', id: result.id, settledCount });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: 'Server Error', error: err.message });
  }
};

const deletePenyesuaian = async (req, res) => {
  const { id } = req.params;

  try {
    const existing = await prisma.data_penyesuaian.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ message: 'Data tidak ditemukan' });

    await prisma.$transaction(async (tx) => {
      // Hapus jurnal penyesuaian terlebih dahulu (key: ref_id = id)
      await tx.jurnal_umum.deleteMany({ where: { ref_id: id } });
      await tx.data_penyesuaian.delete({ where: { id } });
    });

    await auditService.logActivity(req, 'HAPUS', 'PENYESUAIAN', `ID: ${id} | ${existing.jenis} | ${existing.uraian} | Rp ${Number(existing.nilai).toLocaleString('id-ID')}`);

    res.json({ message: 'Penyesuaian berhasil dihapus' });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: 'Server Error', error: err.message });
  }
};

module.exports = {
  createPenyesuaian,
  getPenyesuaianList,
  getPenyesuaianById,
  updatePenyesuaian,
  deletePenyesuaian
};
