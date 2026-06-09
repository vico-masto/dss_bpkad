/**
 * Bridge Controller — GAS (Google Apps Script) → DSS BPKAD
 * Menerima data dari aplikasi E-Arsip SP2D BPKAD
 * untuk disinkronkan ke database DSS.
 */
const prisma = require('../prismaClient');
const auditService = require('../services/auditService');
const { parseDateSafe } = require('../utils/dateUtils');

/**
 * Terima SP2D baru dari GAS
 * POST /api/bridge/sp2d
 */
const receiveSp2d = async (req, res) => {
  try {
    const {
      nomor, tanggal, opd, jenis, uraian, penerima,
      nilai_bruto, nilai_potongan, tahun, tanggal_pencairan,
      file_url, status_dana, sumber_dana_id, details
    } = req.body;

    // Validasi minimal
    if (!nomor || !opd || !penerima || !nilai_bruto) {
      return res.status(400).json({
        status: false,
        message: 'Field wajib: nomor, opd, penerima, nilai_bruto'
      });
    }

    // Cek duplikasi berdasarkan nomor
    const existing = await prisma.data_sp2d.findUnique({
      where: { nomor: nomor }
    });

    if (existing) {
      // Update jika sudah ada
      const updated = await prisma.data_sp2d.update({
        where: { nomor: nomor },
        data: {
          tanggal: parseDateSafe(tanggal) || existing.tanggal,
          tanggal_pencairan: tanggal_pencairan ? parseDateSafe(tanggal_pencairan) : existing.tanggal_pencairan,
          opd: opd || existing.opd,
          jenis: jenis || existing.jenis,
          uraian: uraian || existing.uraian,
          penerima: penerima || existing.penerima,
          nilai_bruto: parseFloat(nilai_bruto) || existing.nilai_bruto,
          nilai_potongan: parseFloat(nilai_potongan) || 0,
          status_dana: status_dana || existing.status_dana,
          file_url: file_url || existing.file_url,
        }
      });

      await auditService.log('Bridge GAS', 'UPDATE SP2D', `${nomor} dari GAS`);
      return res.json({ status: true, action: 'updated', id: updated.id });
    }

    // Buat baru
    const tglObj = parseDateSafe(tanggal) || new Date();
    const tahunAnggaran = tahun || tglObj.getFullYear();

    // Generate ID
    const id = 'GAS-' + new Date().getTime();

    // Parse rincian dana dari GAS
    const rincian = Array.isArray(details) ? details : [];
    const defaultPotongan = parseFloat(nilai_potongan) || 0;

    // Siapkan detail untuk create
    const detailCreate = rincian.length > 0 ? {
      create: rincian.map((d, idx) => ({
        id: `${id}-D${idx + 1}`,
        id_sumber_dana: d.id_sumber_dana || sumber_dana_id || null,
        nilai_bruto: parseFloat(d.nilai_bruto) || 0,
        nilai_neto: parseFloat(d.nilai_neto) || (parseFloat(d.nilai_bruto) || 0) - defaultPotongan
      }))
    } : (sumber_dana_id ? {
      create: [{
        id: `${id}-D1`,
        id_sumber_dana: sumber_dana_id,
        nilai_bruto: parseFloat(nilai_bruto) || 0,
        nilai_neto: (parseFloat(nilai_bruto) || 0) - defaultPotongan
      }]
    } : undefined);

    const sp2d = await prisma.data_sp2d.create({
      data: {
        id: id,
        nomor: nomor,
        tanggal: tglObj,
        tanggal_pencairan: tanggal_pencairan ? parseDateSafe(tanggal_pencairan) : null,
        tahun: tahunAnggaran,
        opd: opd,
        jenis: jenis || 'LS',
        uraian: uraian || '',
        penerima: penerima,
        nilai_bruto: parseFloat(nilai_bruto) || 0,
        nilai_potongan: defaultPotongan,
        status_dana: status_dana || 'Aman',
        status_rekon: 'BELUM',
        file_url: file_url || null,
        details: detailCreate
      }
    });

    await auditService.log('Bridge GAS', 'TAMBAH SP2D', `${nomor} dari GAS`);
    return res.status(201).json({ status: true, action: 'created', id: sp2d.id });

  } catch (err) {
    console.error('[Bridge GAS] Error create SP2D:', err.message);
    return res.status(500).json({ status: false, message: err.message });
  }
};

/**
 * Terima multiple SP2D dari GAS (batch import)
 * POST /api/bridge/sp2d/batch
 */
const receiveSp2dBatch = async (req, res) => {
  try {
    const { items } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ status: false, message: 'Requires items array' });
    }

    const results = { created: 0, updated: 0, errors: [] };

    for (const item of items) {
      try {
        const { nomor, opd, penerima, nilai_bruto } = item;
        if (!nomor || !opd || !penerima || !nilai_bruto) {
          results.errors.push({ nomor: nomor || 'unknown', reason: 'Missing required fields' });
          continue;
        }

        const existing = await prisma.data_sp2d.findUnique({ where: { nomor: nomor } });
        const tglObj = parseDateSafe(item.tanggal) || new Date();

        if (existing) {
          await prisma.data_sp2d.update({
            where: { nomor: nomor },
            data: {
              opd: item.opd || existing.opd,
              jenis: item.jenis || existing.jenis,
              uraian: item.uraian || existing.uraian,
              penerima: item.penerima || existing.penerima,
              nilai_bruto: parseFloat(item.nilai_bruto) || existing.nilai_bruto,
              nilai_potongan: parseFloat(item.nilai_potongan) || 0,
              tanggal: tglObj,
              tanggal_pencairan: item.tanggal_pencairan ? parseDateSafe(item.tanggal_pencairan) : existing.tanggal_pencairan,
              status_dana: item.status_dana || existing.status_dana,
              file_url: item.file_url || existing.file_url,
            }
          });
          results.updated++;
        } else {
          const id = 'GAS-' + new Date().getTime() + '-' + Math.random().toString(36).slice(2, 6);
          await prisma.data_sp2d.create({
            data: {
              id, nomor, opd: item.opd,
              tanggal: tglObj,
              tanggal_pencairan: item.tanggal_pencairan ? parseDateSafe(item.tanggal_pencairan) : null,
              tahun: item.tahun || tglObj.getFullYear(),
              jenis: item.jenis || 'LS',
              uraian: item.uraian || '',
              penerima: item.penerima,
              nilai_bruto: parseFloat(item.nilai_bruto) || 0,
              nilai_potongan: parseFloat(item.nilai_potongan) || 0,
              status_dana: item.status_dana || 'Aman',
              status_rekon: 'BELUM',
              file_url: item.file_url || null,
            }
          });
          results.created++;
        }
      } catch (itemErr) {
        results.errors.push({ nomor: item.nomor || 'unknown', reason: itemErr.message });
      }
    }

    await auditService.log('Bridge GAS', 'BATCH SP2D', `${results.created} created, ${results.updated} updated, ${results.errors.length} errors`);
    return res.json({ status: true, ...results });

  } catch (err) {
    return res.status(500).json({ status: false, message: err.message });
  }
};

/**
 * Health check untuk GAS test koneksi
 * GET /api/bridge/health
 */
const healthCheck = async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return res.json({
      status: true,
      service: 'DSS Bridge API',
      version: '1.0.0',
      db_connected: true,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    return res.json({
      status: true,
      service: 'DSS Bridge API',
      version: '1.0.0',
      db_connected: false,
      timestamp: new Date().toISOString()
    });
  }
};

/**
 * Terima data partial dari Antigravity (PDF SP2D/SPM Splitter)
 * POST /api/bridge/antigravity
 * Antigravity hanya punya data minimal dari OCR:
 *   - nomor_dokumen (e.g., "12.34/03.0/SP2D/XX/2026")
 *   - tanggal_dokumen (hasil OCR)
 *   - jenis_dokumen (SPM / SP2D / TIDAK_DIKENAL)
 *   - file_path_hasil (path PDF hasil split)
 */
const receiveFromAntigravity = async (req, res) => {
  try {
    const { nomor_dokumen, tanggal_dokumen, jenis_dokumen, file_path_hasil } = req.body;

    if (!nomor_dokumen || !jenis_dokumen) {
      return res.status(400).json({
        status: false,
        message: 'Field wajib: nomor_dokumen, jenis_dokumen'
      });
    }

    // Hanya SP2D yang masuk ke data_sp2d; SPM dicatat sebagai info saja
    if (jenis_dokumen !== 'SP2D') {
      return res.status(200).json({
        status: true,
        action: 'skipped',
        message: `Jenis ${jenis_dokumen} tidak masuk ke tabel SP2D. Dicatat sebagai referensi.`,
        nomor: nomor_dokumen
      });
    }

    // Parse nomor untuk ekstrak OPD/kode (fallback jika tidak ada)
    const tglObj = parseDateSafe(tanggal_dokumen) || new Date();
    const tahunAnggaran = tglObj.getFullYear();

    // Cek duplikasi berdasarkan nomor
    const existing = await prisma.data_sp2d.findUnique({
      where: { nomor: nomor_dokumen }
    });

    if (existing) {
      // Update partial — hanya update field yang ada
      const updateData = {};
      if (tanggal_dokumen) updateData.tanggal = tglObj;
      if (file_path_hasil) updateData.file_url = file_path_hasil;
      if (jenis_dokumen) updateData.jenis = jenis_dokumen;
      updateData.sumber = 'ANTIGRAVITY';

      const updated = await prisma.data_sp2d.update({
        where: { nomor: nomor_dokumen },
        data: updateData
      });

      await auditService.log('Bridge Antigravity', 'UPDATE SP2D', `${nomor_dokumen}`);
      return res.json({ status: true, action: 'updated', id: updated.id });
    }

    // Buat baru dengan data partial
    const id = 'AG-' + new Date().getTime();

    const sp2d = await prisma.data_sp2d.create({
      data: {
        id: id,
        nomor: nomor_dokumen,
        tanggal: tglObj,
        tahun: tahunAnggaran,
        opd: 'ANTIGRAVITY-AUTO',      // placeholder — perlu diisi manual
        jenis: jenis_dokumen,
        uraian: 'Dari Antigravity PDF Splitter — data partial, perlu dilengkapi',
        penerima: 'ANTIGRAVITY-AUTO',  // placeholder
        nilai_bruto: 0,               // placeholder — tidak tersedia dari OCR
        nilai_potongan: 0,
        status_dana: 'Aman',
        status_rekon: 'BELUM',
        sumber: 'ANTIGRAVITY',
        file_url: file_path_hasil || null,
      }
    });

    await auditService.log('Bridge Antigravity', 'TAMBAH SP2D', `${nomor_dokumen}`);
    return res.status(201).json({ status: true, action: 'created', id: sp2d.id, partial: true });

  } catch (err) {
    console.error('[Bridge Antigravity] Error:', err.message);
    return res.status(500).json({ status: false, message: err.message });
  }
};

/**
 * Batch import dari Antigravity
 * POST /api/bridge/antigravity/batch
 */
const receiveFromAntigravityBatch = async (req, res) => {
  try {
    const { items } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ status: false, message: 'Requires items array' });
    }

    const results = { created: 0, updated: 0, skipped: 0, errors: [] };

    for (const item of items) {
      try {
        // Reuse single-item logic via internal handler
        const mockReq = { body: item };
        const mockRes = {
          json: (data) => data,
          status: (code) => ({ json: (data) => ({ ...data, _status: code }) })
        };

        // Only process SP2D
        if (item.jenis_dokumen !== 'SP2D') {
          results.skipped++;
          continue;
        }

        const { nomor_dokumen, tanggal_dokumen, jenis_dokumen, file_path_hasil } = item;
        if (!nomor_dokumen) {
          results.errors.push({ nomor: 'unknown', reason: 'Missing nomor_dokumen' });
          continue;
        }

        const tglObj = parseDateSafe(tanggal_dokumen) || new Date();
        const existing = await prisma.data_sp2d.findUnique({ where: { nomor: nomor_dokumen } });

        if (existing) {
          const updateData = {};
          if (tanggal_dokumen) updateData.tanggal = tglObj;
          if (file_path_hasil) updateData.file_url = file_path_hasil;
          updateData.sumber = 'ANTIGRAVITY';
          await prisma.data_sp2d.update({ where: { nomor: nomor_dokumen }, data: updateData });
          results.updated++;
        } else {
          const id = 'AG-' + new Date().getTime() + '-' + Math.random().toString(36).slice(2, 6);
          await prisma.data_sp2d.create({
            data: {
              id, nomor: nomor_dokumen, tanggal: tglObj,
              tahun: tglObj.getFullYear(), opd: 'ANTIGRAVITY-AUTO',
              jenis: jenis_dokumen || 'LS',
              uraian: 'Dari Antigravity PDF Splitter — data partial, perlu dilengkapi',
              penerima: 'ANTIGRAVITY-AUTO', nilai_bruto: 0,
              nilai_potongan: 0, status_dana: 'Aman',
              status_rekon: 'BELUM', sumber: 'ANTIGRAVITY',
              file_url: file_path_hasil || null,
            }
          });
          results.created++;
        }
      } catch (itemErr) {
        results.errors.push({ nomor: item.nomor_dokumen || 'unknown', reason: itemErr.message });
      }
    }

    await auditService.log('Bridge Antigravity', 'BATCH', `${results.created} created, ${results.updated} updated, ${results.skipped} skipped, ${results.errors.length} errors`);
    return res.json({ status: true, ...results });

  } catch (err) {
    return res.status(500).json({ status: false, message: err.message });
  }
};

module.exports = { receiveSp2d, receiveSp2dBatch, receiveFromAntigravity, receiveFromAntigravityBatch, healthCheck };
