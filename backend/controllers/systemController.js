const prisma = require('../prismaClient');

/**
 * MEMBERSIHKAN SELURUH DATA TRANSAKSI (DUMMY/REAL)
 * Hati-hati: Tindakan ini tidak dapat dibatalkan.
 */
const purgeAllData = async (req, res) => {
  const { pin } = req.body;
  const userId = req.user.id;

  try {
    // 0. Verifikasi PIN Khusus
    const user = await prisma.users.findUnique({
      where: { id: userId },
      select: { special_pin: true }
    });

    if (!user || user.special_pin !== pin) {
      return res.status(403).json({ success: false, message: 'PIN Khusus salah. Akses ditolak.' });
    }

    // Daftar tabel yang akan dikosongkan
    const tables = [
      'detail_sp2d',
      'data_sp2d',
      'data_pendapatan',
      'bank_statement',
      'data_penyesuaian',
      'setoran_pajak',
      'jurnal_talangan',
      'saldo_awal',
      'simulator_scenarios',
      'proyeksi_pendapatan',
      'jurnal_umum',
      'log_aktivitas'
    ];

    await prisma.$transaction(async (tx) => {
      for (const table of tables) {
        await tx.$executeRawUnsafe(`TRUNCATE TABLE "${table}" RESTART IDENTITY CASCADE`);
      }

      // Buat log aktivitas penanda
      await tx.log_aktivitas.create({
        data: {
          user_pelaksana: req.user?.username || 'SYSTEM',
          aksi: 'RESET SYSTEM',
          detail: 'Pembersihan seluruh data transaksi dummy oleh admin'
        }
      });
    });

    res.json({ 
      success: true, 
      message: 'Sistem berhasil dibersihkan. Seluruh data transaksi telah dihapus dan siap digunakan untuk data real.' 
    });
  } catch (err) {
    console.error('CRITICAL ERROR PURGE DATA:', err.message);
    res.status(500).json({ 
      success: false, 
      message: 'Gagal membersihkan data', 
      error: err.message 
    });
  }
};

/**
 * Terapkan trigger PostgreSQL untuk proteksi field kritis.
 * Harus dijalankan sekali setelah deploy atau update database.
 * Endpoint: POST /api/admin/apply-db-triggers
 */
const applyDatabaseTriggers = async (req, res) => {
  try {
    // Trigger untuk data_sp2d
    await prisma.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION fn_protect_tanggal_pencairan_sp2d()
      RETURNS TRIGGER AS $$
      BEGIN
        IF OLD.tanggal_pencairan IS NOT NULL AND NEW.tanggal_pencairan IS NULL THEN
          RAISE EXCEPTION
            'PROTEKSI DATA KRITIS: tanggal_pencairan SP2D "%" (id=%) tidak boleh dihapus. Nilai saat ini: %.',
            OLD.nomor, OLD.id, OLD.tanggal_pencairan;
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    await prisma.$executeRawUnsafe(`
      DROP TRIGGER IF EXISTS trg_protect_tanggal_pencairan_sp2d ON data_sp2d;
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER trg_protect_tanggal_pencairan_sp2d
        BEFORE UPDATE ON data_sp2d
        FOR EACH ROW
        EXECUTE FUNCTION fn_protect_tanggal_pencairan_sp2d();
    `);

    // Trigger untuk data_sp2d_potongan
    await prisma.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION fn_protect_tanggal_pencairan_potongan()
      RETURNS TRIGGER AS $$
      BEGIN
        IF OLD.tanggal_pencairan IS NOT NULL AND NEW.tanggal_pencairan IS NULL THEN
          RAISE EXCEPTION
            'PROTEKSI DATA KRITIS: tanggal_pencairan potongan SP2D "%" (id=%) tidak boleh dihapus. Nilai saat ini: %.',
            OLD.nomor_sp2d, OLD.id, OLD.tanggal_pencairan;
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    await prisma.$executeRawUnsafe(`
      DROP TRIGGER IF EXISTS trg_protect_tanggal_pencairan_potongan ON data_sp2d_potongan;
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER trg_protect_tanggal_pencairan_potongan
        BEFORE UPDATE ON data_sp2d_potongan
        FOR EACH ROW
        EXECUTE FUNCTION fn_protect_tanggal_pencairan_potongan();
    `);

    // Verifikasi
    const triggerCheck = await prisma.$queryRaw`
      SELECT trigger_name, event_object_table
      FROM information_schema.triggers
      WHERE trigger_name IN (
        'trg_protect_tanggal_pencairan_sp2d',
        'trg_protect_tanggal_pencairan_potongan'
      )
      ORDER BY event_object_table
    `;

    await prisma.log_aktivitas.create({
      data: {
        user_pelaksana: req.user?.username || req.user?.email || 'ADMIN',
        aksi: 'APPLY_DB_TRIGGERS',
        detail: `Trigger proteksi tanggal_pencairan berhasil diterapkan pada ${triggerCheck.length} tabel.`
      }
    }).catch(() => {});

    res.json({
      success: true,
      message: `Trigger proteksi tanggal_pencairan berhasil diterapkan.`,
      triggers: triggerCheck.map(t => ({ trigger: t.trigger_name, tabel: t.event_object_table }))
    });
  } catch (err) {
    console.error('APPLY DB TRIGGERS ERROR:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = {
  purgeAllData,
  applyDatabaseTriggers
};
