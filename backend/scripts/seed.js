const { Client } = require('pg');
require('dotenv').config({ path: '../.env' });

const client = new Client({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/dss_bpkad'
});

async function seed() {
  await client.connect();
  console.log('Seeding data...');

  try {
    const tahun = new Date().getFullYear();

    // 1. Seed Saldo Awal
    const saldoAwal = [
      ['SD-PAD', 5000000000],
      ['SD-DAU', 15000000000],
      ['SD-SILPA', 2500000000]
    ];
    for (const [id, nilai] of saldoAwal) {
      await client.query(
        'INSERT INTO saldo_awal (id, tahun, id_sumber_dana, nilai) VALUES ($1, $2, $3, $4) ON CONFLICT (tahun, id_sumber_dana) DO UPDATE SET nilai = $4',
        [`SA-${id}-${tahun}`, tahun, id, nilai]
      );
    }

    // 2. Seed Master Pagu
    const opds = ['DINAS PENDIDIKAN', 'DINAS KESEHATAN', 'SEKRETARIAT DAERAH', 'DINAS PEKERJAAN UMUM'];
    const sumberDanas = ['SD-PAD', 'SD-DAU'];
    
    for (const opd of opds) {
      for (const sd of sumberDanas) {
         await client.query(
           'INSERT INTO master_pagu (tahun, opd, id_sumber_dana, nilai) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING',
           [tahun, opd, sd, 200000000000]
         );
      }
    }

    // 3. Seed Pendapatan (Kas Masuk)
    const pendapatan = [
      ['2026-01-15', 'PAD-001', 'Penerimaan Pajak Daerah', 'SD-PAD', 1250000000],
      ['2026-02-10', 'DAU-001', 'Penyaluran DAU Tahap I', 'SD-DAU', 45000000000],
      ['2026-03-05', 'PAD-002', 'Retribusi Perizinan', 'SD-PAD', 750000000]
    ];
    for (const [tgl, no, uraian, sd, nilai] of pendapatan) {
      await client.query(
        'INSERT INTO data_pendapatan (id, tanggal, tahun, nomor_bukti, uraian, id_sumber_dana, nilai) VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT DO NOTHING',
        [`INC-${no}`, tgl, tahun, no, uraian, sd, nilai]
      );
    }

    // 4. Seed SP2D (Pengeluaran)
    const sp2ds = [
      ['SP2D-001', '2026-03-12', 'DINAS PENDIDIKAN', 'LS GAJI', 'Gaji ASN Maret 2026', 'Bendahara Gaji', 15430000000, 100000000, 'PPN/PPh', 'SD-DAU'],
      ['SP2D-002', '2026-04-02', 'DINAS KESEHATAN', 'LS BARJAS', 'Pengadaan Alkes RSUD', 'PT. Medika Jaya', 8500000000, 0, '', 'SD-PAD'],
      ['SP2D-003', '2026-04-10', 'DINAS PENDIDIKAN', 'TU', 'Biaya Operasional Sekolah', 'Bendahara BOS', 2500000000, 0, '', 'SD-DAU']
    ];

    for (const [no, tgl, opd, jenis, uraian, penerima, bruto, pot, jpot, sd] of sp2ds) {
      const id = `EXP-${no}`;
      await client.query(
        'INSERT INTO data_sp2d (id, nomor, tanggal, tahun, opd, jenis, uraian, penerima, nilai_bruto, nilai_potongan, jenis_potongan, status_dana) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) ON CONFLICT DO NOTHING',
        [id, no, tgl, tahun, opd, jenis, uraian, penerima, bruto, pot, jpot, 'Aman']
      );
      await client.query(
        'INSERT INTO detail_sp2d (id_sp2d, id_sumber_dana, nilai_bruto, nilai_neto) VALUES ($1, $2, $3, $4)',
        [id, sd, bruto, bruto - pot]
      );
    }

    console.log('Seeding completed successfully!');
  } catch (err) {
    console.error('Seeding error:', err);
  } finally {
    await client.end();
  }
}

seed();
