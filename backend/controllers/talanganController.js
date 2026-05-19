const prisma = require('../prismaClient');
const auditService = require('../services/auditService');
const dssService = require('../services/dssService');

const getTalanganList = async (req, res) => {
  try {
    const data = await prisma.jurnal_talangan.findMany({
      orderBy: [
        { status: 'asc' },
        { tanggal: 'desc' }
      ]
    });
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: 'Server Error', error: err.message });
  }
};

const settleTalanganManual = async (req, res) => {
  const { id } = req.params;
  try {
    const result = await prisma.$transaction(async (tx) => {
      const talangan = await tx.jurnal_talangan.update({
        where: { id },
        data: { status: 'SELESAI', tanggal_selesai: new Date() }
      });

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
      return talangan;
    });

    await auditService.logActivity(req, 'PELUNASAN', 'TALANGAN', `ID: ${id}, Ref: ${result.no_referensi}`);
    res.json({ message: 'Talangan berhasil dinyatakan lunas secara manual' });
  } catch (err) {
    res.status(500).json({ message: 'Server Error', error: err.message });
  }
};

const createTalanganManual = async (req, res) => {
  const { id_sumber_dana_asal, id_sumber_dana_talangan, nilai, keterangan } = req.body;

  if (id_sumber_dana_asal === id_sumber_dana_talangan) {
    return res.status(400).json({ message: 'Sumber dana asal dan talangan tidak boleh sama' });
  }

  try {
    const id = `MAN-TAL-${Date.now()}`;
    const talangan = await prisma.jurnal_talangan.create({
      data: {
        id,
        tanggal: new Date(),
        id_sumber_asli: id_sumber_dana_asal,
        id_sumber_talangan: id_sumber_dana_talangan,
        nilai: parseFloat(nilai),
        status: 'BELUM',
        uraian: keterangan || 'Perekaman Manual'
      }
    });
    
    await auditService.logActivity(req, 'TAMBAH', 'TALANGAN', `Asal: ${id_sumber_dana_asal}, Talangan: ${id_sumber_dana_talangan}, Rp ${nilai}`);
    res.status(201).json(talangan);
  } catch (err) {
    res.status(500).json({ message: 'Server Error', error: err.message });
  }
};

const assignSumberTalangan = async (req, res) => {
  const { id } = req.params;
  const { id_sumber_talangan } = req.body;
  try {
    const result = await prisma.$transaction(async (tx) => {
      const original = await tx.jurnal_talangan.findUnique({ where: { id } });
      if (!original) throw new Error('Data talangan tidak ditemukan');

      if (id_sumber_talangan === original.id_sumber_asli) {
        await tx.jurnal_talangan.delete({ where: { id } });
        
        if (original.no_referensi) {
          const stillExist = await tx.jurnal_talangan.count({
            where: { no_referensi: original.no_referensi }
          });
          if (stillExist === 0) {
            await tx.data_sp2d.updateMany({
              where: { nomor: original.no_referensi },
              data: { status_dana: 'Aman' }
            });
          }
        }
        return { type: 'DELETE', data: original };
      }

      const updated = await tx.jurnal_talangan.update({
        where: { id },
        data: { id_sumber_talangan }
      });
      return { type: 'UPDATE', data: updated };
    });

    if (result.type === 'DELETE') {
      await auditService.logActivity(req, 'BATAL', 'TALANGAN', `Ref: ${result.data.no_referensi}, sumber dikembalikan ke asli.`);
      return res.json({ message: 'Sumber dana dikembalikan ke Asli. Record talangan telah dihapus.' });
    }

    await auditService.logActivity(req, 'UPDATE', 'TALANGAN', `Ref: ${result.data.no_referensi}, Penjamin diubah ke: ${id_sumber_talangan}`);
    res.json({ message: 'Sumber dana talangan berhasil ditandai secara sistematis' });
  } catch (err) {
    res.status(500).json({ message: 'Server Error', error: err.message });
  }
};

const splitTalangan = async (req, res) => {
  const { id } = req.params;
  const { allocations } = req.body; // Array: [{ id_sumber_talangan, nilai }]

  try {
    const result = await prisma.$transaction(async (tx) => {
      const orig = await tx.jurnal_talangan.findUnique({ where: { id } });
      if (!orig) throw new Error('Data talangan tidak ditemukan');

      const totalAlloc = allocations.reduce((sum, a) => sum + parseFloat(a.nilai), 0);
      if (Math.abs(totalAlloc - Number(orig.nilai)) > 1) {
        throw new Error('Total alokasi harus sama dengan nilai rincian asli');
      }

      await tx.jurnal_talangan.delete({ where: { id } });

      for (const alloc of allocations) {
        if (alloc.id_sumber_talangan === orig.id_sumber_asli) continue; 

        await tx.jurnal_talangan.create({
          data: {
            id: `SPLIT-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            tanggal: orig.tanggal,
            no_referensi: orig.no_referensi,
            id_sumber_asli: orig.id_sumber_asli,
            id_sumber_talangan: alloc.id_sumber_talangan,
            nilai: parseFloat(alloc.nilai),
            status: orig.status,
            uraian: orig.uraian
          }
        });
      }

      if (orig.no_referensi) {
        const stillExist = await tx.jurnal_talangan.count({
          where: { no_referensi: orig.no_referensi }
        });
        if (stillExist === 0) {
          await tx.data_sp2d.updateMany({
            where: { nomor: orig.no_referensi },
            data: { status_dana: 'Aman' }
          });
        }
      }
      return orig;
    });

    await auditService.logActivity(req, 'SPLIT', 'TALANGAN', `Ref: ${result.no_referensi}, Menjadi ${allocations.length} bagian.`);
    res.json({ message: 'Pembagian alokasi kebijakan talangan berhasil dicatat secara sistematis' });
  } catch (err) {
    res.status(500).json({ message: 'Server Error', error: err.message });
  }
};

const bulkSettleTalangan = async (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ message: 'Pilih setidaknya satu data untuk dilunasi' });
  }

  try {
    await prisma.$transaction(async (tx) => {
      for (const id of ids) {
        const talangan = await tx.jurnal_talangan.update({
          where: { id },
          data: { status: 'SELESAI', tanggal_selesai: new Date() }
        });

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
      }
    });

    await auditService.logActivity(req, 'BULK_SETTLE', 'TALANGAN', `${ids.length} rincian talangan dilunasi massal.`);
    res.json({ message: `${ids.length} talangan berhasil dilunasi secara massal` });
  } catch (err) {
    res.status(500).json({ message: 'Server Error', error: err.message });
  }
};

/**
 * Deteksi anomali nilai talangan:
 *   A) jurnal BELUM tapi SP2D.status_dana = 'Aman'  → orphaned (harus di-settle)
 *   B) jurnal.nilai ≠ SP2D.nilai_neto               → salah nominal (bruto vs neto)
 */
const getTalanganAnomalies = async (req, res) => {
  try {
    // A: orphaned — SP2D sudah Aman tapi jurnal masih BELUM
    const orphaned = await prisma.$queryRaw`
      SELECT j.id, j.no_referensi, j.nilai::numeric as nilai_jurnal,
             s.nilai_neto::numeric as nilai_neto_sp2d, s.nilai_bruto::numeric as nilai_bruto_sp2d,
             s.status_dana, j.id_sumber_asli, j.id_sumber_talangan
      FROM jurnal_talangan j
      JOIN data_sp2d s ON j.no_referensi = s.nomor
      WHERE j.status = 'BELUM' AND s.status_dana <> 'Talangan'
      ORDER BY j.no_referensi
    `;

    // B: nilai tidak cocok — jurnal pakai bruto tapi SP2D.nilai_neto berbeda
    const nilaiSalah = await prisma.$queryRaw`
      SELECT j.id, j.no_referensi,
             j.nilai::numeric as nilai_jurnal,
             s.nilai_neto::numeric as nilai_neto_sp2d,
             s.nilai_bruto::numeric as nilai_bruto_sp2d,
             ABS(j.nilai::numeric - s.nilai_neto::numeric) as selisih
      FROM jurnal_talangan j
      JOIN data_sp2d s ON j.no_referensi = s.nomor
      WHERE j.status = 'BELUM'
        AND s.nilai_potongan > 0
        AND ABS(j.nilai::numeric - s.nilai_neto::numeric) > 1
      ORDER BY selisih DESC
      LIMIT 200
    `;

    res.json({
      orphaned: orphaned.map(r => ({ ...r, nilai_jurnal: Number(r.nilai_jurnal), nilai_neto_sp2d: Number(r.nilai_neto_sp2d), nilai_bruto_sp2d: Number(r.nilai_bruto_sp2d) })),
      nilai_salah: nilaiSalah.map(r => ({ ...r, nilai_jurnal: Number(r.nilai_jurnal), nilai_neto_sp2d: Number(r.nilai_neto_sp2d), nilai_bruto_sp2d: Number(r.nilai_bruto_sp2d), selisih: Number(r.selisih) })),
      total_orphaned: orphaned.length,
      total_nilai_salah: nilaiSalah.length
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * Perbaiki anomali nilai talangan:
 *   1. Orphaned → ubah status jadi SELESAI (SP2D sudah Aman)
 *   2. Nilai salah (bruto) → koreksi ke nilai_neto SP2D yang bersangkutan
 */
const fixTalanganAnomalies = async (req, res) => {
  const dryRun = req.body.dry_run === true;
  try {
    let fixedOrphaned = 0;
    let fixedNilai = 0;

    // Fix A: orphaned
    const orphaned = await prisma.$queryRaw`
      SELECT j.id FROM jurnal_talangan j
      JOIN data_sp2d s ON j.no_referensi = s.nomor
      WHERE j.status = 'BELUM' AND s.status_dana <> 'Talangan'
    `;
    if (orphaned.length > 0 && !dryRun) {
      await prisma.jurnal_talangan.updateMany({
        where: { id: { in: orphaned.map(r => r.id) }, status: 'BELUM' },
        data: { status: 'SELESAI', tanggal_selesai: new Date() }
      });
    }
    fixedOrphaned = orphaned.length;

    // Fix B: nilai jurnal memakai bruto, koreksi ke neto
    const salah = await prisma.$queryRaw`
      SELECT j.id, s.nilai_neto::numeric as nilai_neto
      FROM jurnal_talangan j
      JOIN data_sp2d s ON j.no_referensi = s.nomor
      WHERE j.status = 'BELUM'
        AND s.nilai_potongan > 0
        AND ABS(j.nilai::numeric - s.nilai_neto::numeric) > 1
    `;
    for (const row of salah) {
      if (!dryRun) {
        await prisma.jurnal_talangan.update({
          where: { id: row.id },
          data: { nilai: Number(row.nilai_neto) }
        });
      }
      fixedNilai++;
    }

    if (!dryRun && (fixedOrphaned + fixedNilai) > 0) {
      await prisma.log_aktivitas.create({
        data: {
          user_pelaksana: req.user?.username || req.user?.email || 'SYSTEM',
          aksi: 'FIX_TALANGAN_ANOMALI',
          detail: `Orphaned di-settle: ${fixedOrphaned}, Nilai dikoreksi ke neto: ${fixedNilai}`
        }
      }).catch(() => {});
    }

    res.json({ dry_run: dryRun, fixed_orphaned: fixedOrphaned, fixed_nilai: fixedNilai });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * Auto-settle talangan jika saldo real-time sumber dana asli sudah mencukupi (>= 0).
 * dry_run=true hanya menghitung kandidat tanpa mengubah data.
 */
const autoSettleByBalance = async (req, res) => {
  const dryRun = req.body.dry_run === true;

  try {
    const outstanding = await prisma.jurnal_talangan.findMany({
      where: { status: 'BELUM', id_sumber_asli: { not: null } },
      select: { id: true, no_referensi: true, id_sumber_asli: true, nilai: true }
    });

    // Kelompokkan per sumber dana untuk efisiensi (1 balance-check per sumber)
    const bySumber = {};
    for (const j of outstanding) {
      if (!bySumber[j.id_sumber_asli]) bySumber[j.id_sumber_asli] = [];
      bySumber[j.id_sumber_asli].push(j);
    }

    let settledCount = 0;
    const settledRefs = new Set();

    for (const [idSumber, items] of Object.entries(bySumber)) {
      const balance = await dssService.getRealTimeBalance(idSumber);
      if (balance >= 0) {
        for (const item of items) {
          if (!dryRun) {
            await prisma.jurnal_talangan.update({
              where: { id: item.id },
              data: { status: 'SELESAI', tanggal_selesai: new Date() }
            });
          }
          settledCount++;
          if (item.no_referensi) settledRefs.add(item.no_referensi);
        }
      }
    }

    if (!dryRun && settledRefs.size > 0) {
      for (const nomor of settledRefs) {
        const stillOutstanding = await prisma.jurnal_talangan.count({
          where: { no_referensi: nomor, status: 'BELUM' }
        });
        if (stillOutstanding === 0) {
          await prisma.data_sp2d.updateMany({
            where: { nomor },
            data: { status_dana: 'Aman' }
          });
        }
      }

      await prisma.log_aktivitas.create({
        data: {
          user_pelaksana: req.user?.username || 'SYSTEM',
          aksi: 'AUTO_SETTLE_BY_BALANCE',
          detail: `Sumber dana tersedia: ${settledCount} talangan lunas, ${settledRefs.size} SP2D diubah ke Aman`
        }
      }).catch(() => {});
    }

    res.json({
      dry_run: dryRun,
      settled_talangan: settledCount,
      sp2d_aman: settledRefs.size
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = {
  getTalanganList,
  settleTalanganManual,
  createTalanganManual,
  assignSumberTalangan,
  splitTalangan,
  bulkSettleTalangan,
  getTalanganAnomalies,
  fixTalanganAnomalies,
  autoSettleByBalance
};
