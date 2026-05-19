const prisma = require('../prismaClient');
const db = require('../config/db');

/**
 * Accounting Engine untuk DSS BPKAD
 * Menghasilkan Jurnal Otomatis berdasarkan transaksi
 */
/**
 * postJournal - Menulis ke jurnal_umum
 * @param {Object} data 
 * @param {Object} tx - Optional Prisma Transaction Client
 */
const postJournal = async ({ tanggal, kode_akun, nama_akun, debet, kredit, keterangan, ref_id, id_sumber_dana }, tx = null) => {
  try {
    const client = tx || prisma;
    await client.jurnal_umum.create({
      data: {
        tanggal: new Date(tanggal),
        kode_akun: String(kode_akun || ""),
        nama_akun: String(nama_akun || ""),
        debet: parseFloat(debet) || 0,
        kredit: parseFloat(kredit) || 0,
        keterangan: String(keterangan || ""),
        ref_id: String(ref_id || ""),
        id_sumber_dana: id_sumber_dana ? String(id_sumber_dana) : null
      }
    });
  } catch (err) {
    console.error('CRITICAL ERROR postJournal (Prisma):', err.message);
    throw err;
  }
};

const processSp2dJournal = async (sp2d, tx = null) => {
  const { id, nomor, tanggal, jenis = '', uraian, nilai_bruto, nilai_potongan, nilai_neto, id_sumber_dana } = sp2d;
  
  let expenseAccount = '5102'; 
  let expenseName = 'BELANJA BARANG & JASA';

  const jenisStr = String(jenis || "");
  if (jenisStr.includes('GAJI')) {
    expenseAccount = '5101';
    expenseName = 'BELANJA PEGAWAI';
  } else if (jenisStr.includes('KONTRAKTUAL') || jenisStr.includes('MODAL')) {
    expenseAccount = '5103';
    expenseName = 'BELANJA MODAL';
  }

  // 1. Jurnal Belanja (Bruto) - Debet
  await postJournal({
    tanggal,
    kode_akun: expenseAccount,
    nama_akun: expenseName,
    debet: nilai_bruto,
    kredit: 0,
    keterangan: `Belanja ${jenis} - ${uraian}`,
    ref_id: nomor,
    id_sumber_dana
  }, tx);

  // 2. Jurnal Potongan Pajak (Jika ada) - Kredit
  if (parseFloat(nilai_potongan) > 0) {
    await postJournal({
      tanggal,
      kode_akun: '2101',
      nama_akun: 'UTANG PAJAK',
      debet: 0,
      kredit: nilai_potongan,
      keterangan: `Pemotongan Pajak SP2D ${nomor}`,
      ref_id: nomor,
      id_sumber_dana
    }, tx);
  }

  // 3. Jurnal Kas Keluar (Neto) - Kredit
  await postJournal({
    tanggal,
    kode_akun: '1101',
    nama_akun: 'KAS DI KAS DAERAH',
    debet: 0,
    kredit: nilai_neto,
    keterangan: `Pembayaran SP2D ${nomor}`,
    ref_id: nomor,
    id_sumber_dana
  }, tx);
};

const processIncomeJournal = async (income, tx = null) => {
  const { nomor_bukti, tanggal, uraian, nilai, id_sumber_dana } = income;

  await postJournal({
    tanggal,
    kode_akun: '1101',
    nama_akun: 'KAS DI KAS DAERAH',
    debet: nilai,
    kredit: 0,
    keterangan: `Penerimaan Kas - ${uraian}`,
    ref_id: nomor_bukti,
    id_sumber_dana
  }, tx);

  await postJournal({
    tanggal,
    kode_akun: '4101',
    nama_akun: 'PENDAPATAN PAD',
    debet: 0,
    kredit: nilai,
    keterangan: `Pendapatan ${uraian}`,
    ref_id: nomor_bukti,
    id_sumber_dana
  }, tx);
};

const processIncomeJournalBulk = async (incomes, tx = null) => {
  if (!incomes || incomes.length === 0) return;
  
  const journalEntries = [];
  for (const inc of incomes) {
    const { nomor_bukti, tanggal, uraian, nilai, id_sumber_dana } = inc;
    
    // Kas di Kas Daerah (Debet)
    journalEntries.push({
      tanggal: new Date(tanggal),
      kode_akun: '1101',
      nama_akun: 'KAS DI KAS DAERAH',
      debet: parseFloat(nilai) || 0,
      kredit: 0,
      keterangan: `Penerimaan Kas - ${uraian}`,
      ref_id: nomor_bukti,
      id_sumber_dana: id_sumber_dana ? String(id_sumber_dana) : null
    });
    
    // Pendapatan PAD (Kredit)
    journalEntries.push({
      tanggal: new Date(tanggal),
      kode_akun: '4101',
      nama_akun: 'PENDAPATAN PAD',
      debet: 0,
      kredit: parseFloat(nilai) || 0,
      keterangan: `Pendapatan ${uraian}`,
      ref_id: nomor_bukti,
      id_sumber_dana: id_sumber_dana ? String(id_sumber_dana) : null
    });
  }

  if (tx) {
    await tx.jurnal_umum.createMany({ data: journalEntries });
  } else {
    await prisma.jurnal_umum.createMany({ data: journalEntries });
  }
};

const processPotonganJournalBulk = async (potonganItems, tx = null) => {
  if (!potonganItems || potonganItems.length === 0) return;
  
  const journalEntries = [];
  for (const p of potonganItems) {
    const { id, jenis_potongan, nilai, id_billing, keterangan, tanggal_pencairan, id_sumber_dana } = p;
    if (!tanggal_pencairan) continue;

    // 1. Debet Utang Pajak (Mengurangi kewajiban)
    journalEntries.push({
      tanggal: new Date(tanggal_pencairan),
      kode_akun: '2101',
      nama_akun: 'UTANG PAJAK',
      debet: parseFloat(nilai) || 0,
      kredit: 0,
      keterangan: `Penyetoran ${jenis_potongan} - ${keterangan} ${id_billing ? '(Billing: ' + id_billing + ')' : ''}`,
      ref_id: id_billing || id,
      id_sumber_dana: id_sumber_dana ? String(id_sumber_dana) : null
    });

    // 2. Kredit Kas di Kas Daerah (Uang Keluar)
    journalEntries.push({
      tanggal: new Date(tanggal_pencairan),
      kode_akun: '1101',
      nama_akun: 'KAS DI KAS DAERAH',
      debet: 0,
      kredit: parseFloat(nilai) || 0,
      keterangan: `Penyetoran ${jenis_potongan} (Disburse Rister) - ${keterangan}`,
      ref_id: id_billing || id,
      id_sumber_dana: id_sumber_dana ? String(id_sumber_dana) : null
    });
  }

  const client = tx || prisma;
  await client.jurnal_umum.createMany({ data: journalEntries });
};

module.exports = {
  postJournal,
  processSp2dJournal,
  processIncomeJournal,
  processIncomeJournalBulk,
  processPotonganJournalBulk
};
