const prisma = require('../prismaClient');
const { Prisma } = require('@prisma/client');
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');

const COLUMN_ALIASES = {
  kode: ['kode', 'kode_rekening', 'kode rekening', 'rekening', 'code', 'no_rek', 'no rek', 'no.rek'],
  uraian: ['uraian', 'nama_rekening', 'nama rekening', 'nama_akun', 'nama akun', 'description', 'deskripsi', 'item'],
  anggaran: ['anggaran', 'pagu', 'pagu_anggaran', 'pagu anggaran', 'budget', 'amount_budget', 'jumlah_budget'],
  realisasi: ['realisasi', 'realisasi_2025', 'realisasi 2025', 'realisasi_thn_ini', 'realisasi tahun ini', 'actual', 'amount', 'jumlah', 'nilai'],
  realisasi_lalu: ['realisasi_2024', 'realisasi 2024', 'realisasi_thn_lalu', 'realisasi tahun lalu', 'actual_last_year'],
};

const getLRAList = async (req, res) => {
  const { tahun, bulan } = req.query;
  try {
    const where = {};
    if (tahun) where.tahun = parseInt(tahun);
    if (bulan) where.bulan = bulan === 'null' ? null : parseInt(bulan);

    const data = await prisma.data_lra.findMany({
      where,
      orderBy: [{ tahun: 'desc' }, { bulan: 'asc' }, { kode_rekening: 'asc' }]
    });
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: 'Server Error', error: err.message });
  }
};

const upsertLRA = async (req, res) => {
  const { id, tahun, bulan, kode_rekening, uraian, anggaran, realisasi, keterangan } = req.body;
  try {
    const data = {
      tahun: parseInt(tahun),
      bulan: bulan ? parseInt(bulan) : null,
      kode_rekening,
      uraian,
      anggaran: parseFloat(anggaran || 0),
      realisasi: parseFloat(realisasi || 0),
      keterangan
    };

    if (id) {
      const result = await prisma.data_lra.update({ where: { id: parseInt(id) }, data });
      res.json(result);
    } else {
      const result = await prisma.data_lra.create({ data });
      res.json(result);
    }
  } catch (err) {
    res.status(500).json({ message: 'Server Error', error: err.message });
  }
};

const deleteLRA = async (req, res) => {
  const { id } = req.params;
  try {
    await prisma.data_lra.delete({ where: { id: parseInt(id) } });
    res.json({ message: 'Data LRA berhasil dihapus' });
  } catch (err) {
    res.status(500).json({ message: 'Server Error', error: err.message });
  }
};

const deleteAllLRA = async (req, res) => {
  const { tahun, bulan } = req.query;
  try {
    const where = {};
    if (tahun) where.tahun = parseInt(tahun);
    if (bulan && bulan !== 'all') where.bulan = bulan === 'null' ? null : parseInt(bulan);

    const deleted = await prisma.data_lra.deleteMany({ where });
    res.json({ message: `${deleted.count} data LRA berhasil dihapus`, count: deleted.count });
  } catch (err) {
    res.status(500).json({ message: 'Server Error', error: err.message });
  }
};

// --- Helper: Fuzzy column matching ---
function findColumn(headers, aliases) {
  const lower = headers.map(h => String(h).toLowerCase().trim());
  for (const alias of aliases) {
    const idx = lower.findIndex(h => h === alias || h.replace(/[^a-z0-9]/g, '') === alias.replace(/[^a-z0-9]/g, ''));
    if (idx !== -1) return idx;
  }
  return -1;
}

const uploadLRA = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'File Excel tidak ditemukan' });
    }

    const tahun = parseInt(req.body.tahun) || new Date().getFullYear() - 1;
    const bulan = req.body.bulan ? parseInt(req.body.bulan) : null;

    const filePath = req.file.path;
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json(sheet, { defval: '' });

    if (jsonData.length === 0) {
      fs.unlinkSync(filePath);
      return res.status(400).json({ message: 'File Excel kosong' });
    }

    const headers = Object.keys(jsonData[0]);
    const colIdx = {
      kode: findColumn(headers, COLUMN_ALIASES.kode),
      uraian: findColumn(headers, COLUMN_ALIASES.uraian),
      anggaran: findColumn(headers, COLUMN_ALIASES.anggaran),
      realisasi: findColumn(headers, COLUMN_ALIASES.realisasi),
    };

    // Fallback: if no realisasi column, try realisasi_lalu
    if (colIdx.realisasi === -1) {
      colIdx.realisasi = findColumn(headers, COLUMN_ALIASES.realisasi_lalu);
    }

    if (colIdx.uraian === -1 || colIdx.kode === -1) {
      fs.unlinkSync(filePath);
      return res.status(400).json({
        message: 'Format Excel tidak dikenali. Pastikan ada kolom: Kode Rekening, URAIAN, ANGGARAN, REALISASI',
        headers_ditemukan: headers
      });
    }

    let inserted = 0;
    let skipped = 0;

    for (const row of jsonData) {
      const kode = String(row[headers[colIdx.kode]] || '').trim();
      const uraian = String(row[headers[colIdx.uraian]] || '').trim();

      // Skip sub-total / judul baris (tidak memiliki kode rekening detail)
      if (!kode || !uraian || uraian.startsWith('JUMLAH') || uraian.startsWith('SISA') || uraian === uraian.toUpperCase()) {
        skipped++;
        continue;
      }

      const anggaran = parseFloat(row[headers[colIdx.anggaran]]) || 0;
      const realisasi = colIdx.realisasi !== -1 ? (parseFloat(row[headers[colIdx.realisasi]]) || 0) : 0;

      // Check if already exists (same tahun, bulan, kode_rekening)
      const existing = await prisma.data_lra.findFirst({
        where: { tahun, bulan, kode_rekening: kode }
      });

      if (existing) {
        await prisma.data_lra.update({
          where: { id: existing.id },
          data: { anggaran, realisasi, uraian, keterangan: `Update from Excel (${tahun})` }
        });
      } else {
        await prisma.data_lra.create({
          data: { tahun, bulan, kode_rekening: kode, uraian, anggaran, realisasi, keterangan: `Import from Excel (${tahun})` }
        });
      }
      inserted++;
    }

    // Cleanup uploaded file
    try { fs.unlinkSync(filePath); } catch {}

    res.json({
      message: `Berhasil: ${inserted} data (${skipped} baris judul/subtotal dilewati)`,
      inserted,
      skipped,
      tahun,
      bulan
    });
  } catch (err) {
    res.status(500).json({ message: 'Server Error', error: err.message });
  }
};

module.exports = {
  getLRAList,
  upsertLRA,
  deleteLRA,
  deleteAllLRA,
  uploadLRA
};
