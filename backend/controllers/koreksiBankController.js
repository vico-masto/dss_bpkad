const prisma = require('../prismaClient');
const auditService = require('../services/auditService');
const { processPenyesuaianJournal } = require('../utils/accountingEngine');
const path = require('path');
const fs = require('fs');

const JenisKoreksi = {
  KURANG_TRANSFER: 'KURANG_TRANSFER',
  LEBIH_TRANSFER: 'LEBIH_TRANSFER',
  PEMINDAHBUKUAN_TANPA_SP2D: 'PEMINDAHBUKUAN_TANPA_SP2D',
  PENUTUP_SELISIH: 'PENUTUP_SELISIH',
};

/**
 * Temukan baris bank selisih induk yang MASIH TERBUKA (belum resolved) untuk
 * satu/beberapa ref induk BKU (SP2D id atau potongan id). Dipakai utk menandai
 * `resolved_at` saat koreksi diterapkan & melepasnya saat VOID.
 */
const findOpenSelisihBankRows = async (tx, refIds) => {
  const refs = (Array.isArray(refIds) ? refIds : [refIds]).filter(Boolean);
  if (!refs.length) return [];
  return tx.bank_statement.findMany({
    where: {
      is_matched: true,
      selisih_nilai: { not: 0 },
      resolved_at: null,
      ref_bku_id: { in: refs },
    },
  });
};

/**
 * Sama seperti di atas namun untuk sebuah induk SP2D: mencakup id SP2D itu
 * sendiri plus seluruh id potongan miliknya (gelondongan).
 */
const findOpenSelisihBankRowsForSp2d = async (tx, sp2dId) => {
  const pots = await tx.data_sp2d_potongan.findMany({
    where: { id_sp2d: sp2dId },
    select: { id: true },
  });
  const refs = [sp2dId, ...pots.map((p) => p.id)];
  return findOpenSelisihBankRows(tx, refs);
};

/**
 * Buat surat koreksi bank + detail + auto-create penyesuaian + link bank_statement.
 * Tanggal transaksi = bank_statement.tanggal (atau tanggal_surat jika bank belum ada).
 */
const createSuratKoreksi = async (req, res) => {
  const {
    nomor_surat,
    tanggal_surat,
    tanggal_diterima,
    pihak_bank,
    keterangan,
  } = req.body;

  let details = req.body.details;
  if (typeof details === 'string') {
    try {
      details = JSON.parse(details);
    } catch (e) {
      return res.status(400).json({ message: 'details harus berupa JSON valid.' });
    }
  }

  if (!nomor_surat || !tanggal_surat || !details || !Array.isArray(details) || details.length === 0) {
    return res.status(400).json({ message: 'nomor_surat, tanggal_surat, dan minimal 1 detail wajib diisi.' });
  }

  const id = `KB-${Date.now()}`;
  const filePath = req.file ? `/uploads/koreksi-bank/${req.file.filename}` : null;

  try {
    const result = await prisma.$transaction(async (tx) => {
      // Total dihitung di awal agar header surat (yang punya FK id_surat NOT DEFERRABLE,
      // di-refer oleh detail) dapat dibuat SEBELUM detail pertama.
      let totalNilai = details.reduce((s, d) => s + Number(d.nilai || 0), 0);
      const createdDetails = [];

      // 1. Create surat_koreksi_bank header DULU (detail menunjuk id_surat via FK)
      const surat = await tx.surat_koreksi_bank.create({
        data: {
          id,
          nomor_surat,
          tanggal_surat: new Date(tanggal_surat),
          tanggal_diterima: tanggal_diterima ? new Date(tanggal_diterima) : null,
          pihak_bank: pihak_bank || null,
          keterangan: keterangan || null,
          file_path: filePath,
          total_nilai: totalNilai,
          status: 'APPLIED',
          user_pelaksana: req.user?.username || 'admin',
        },
      });

      for (const d of details) {
        const { jenis_koreksi, nilai, uraian, id_sumber_dana, ref_bank_id, ref_bank_koreksi_id, ref_sp2d_id } = d;

        if (!jenis_koreksi || !nilai || !uraian) {
          throw new Error(`Detail wajib: jenis_koreksi, nilai, uraian. Diterima: ${JSON.stringify(d)}`);
        }

        const detailId = `DKB-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        totalNilai += Number(nilai);

        // Resolve tanggal transaksi + baris bank induk (perlu utk resolve induk selisih)
        let tanggalTransaksi = new Date(tanggal_surat);
        let bankRow = null;
        if (ref_bank_id) {
          bankRow = await tx.bank_statement.findUnique({ where: { id: parseInt(ref_bank_id, 10) } });
          if (bankRow) tanggalTransaksi = new Date(bankRow.tanggal);
        }

        // ── Resolve & validasi ref_sp2d_id (FK → data_sp2d.id) SEBELUM create ──
        // User boleh mengisi NOMOR SP2D atau UUID. Resolve ke data_sp2d.id agar FK
        // detail_koreksi_bank_ref_sp2d_id_fkey tidak violasi (raw 500).
        // PENUTUP_SELISIH → ref_sp2d_id ditentukan otomatis dari bankRow.ref_bku_id (baris ~248),
        // jadi tidak menerima nilai dari frontend.
        let cleanRefSp2dId = null;
        if (jenis_koreksi !== JenisKoreksi.PENUTUP_SELISIH && ref_sp2d_id) {
          const refSp2dRaw = String(ref_sp2d_id).trim();
          if (refSp2dRaw) {
            let resolved = await tx.data_sp2d.findUnique({ where: { id: refSp2dRaw } });
            if (!resolved) resolved = await tx.data_sp2d.findUnique({ where: { nomor: refSp2dRaw } });
            if (!resolved) {
              throw new Error(`SP2D "${refSp2dRaw}" tidak ditemukan. Isi dengan UUID atau Nomor SP2D yang valid.`);
            }
            cleanRefSp2dId = resolved.id;
          }
        } else if (
          jenis_koreksi !== JenisKoreksi.PENUTUP_SELISIH &&
          !ref_sp2d_id &&
          bankRow &&
          bankRow.ref_bku_id &&
          bankRow.ref_bku_id.startsWith('SP2D-')
        ) {
          // Baris bank SELISIH_MATCHED tanpa ref_sp2d_id → resolve induk dari ref_bku_id
          const resolved = await tx.data_sp2d.findUnique({ where: { id: bankRow.ref_bku_id } });
          if (resolved) cleanRefSp2dId = resolved.id;
        }

        // 1. Create detail_koreksi_bank
        const detail = await tx.detail_koreksi_bank.create({
          data: {
            id: detailId,
            id_surat: id,
            jenis_koreksi,
            nilai: parseFloat(nilai),
            uraian,
            id_sumber_dana: id_sumber_dana || null,
            ref_bank_id: ref_bank_id ? parseInt(ref_bank_id, 10) : null,
            ref_sp2d_id: cleanRefSp2dId,
            status: 'PENDING',
          },
        });

        // ═══════════════════════════════════════════════════════════════════════
        // PENUTUP_SELISIH — penutupan selisih via "penyesuaian-jembatan".
        //
        // PRINSIP (dikunci, sesuai aturan perbankan & akuntansi pemerintah):
        //   Nilai mutasi rekening koran (bank_statement.debet/kredit) TIDAK PERNAH
        //   diubah. Jika bank memperbaiki selisih, ia menerbitkan baris mutasi
        //   KOREKSI baru di rekening koran berikutnya (mis. kredit Rp 1 di Agustus
        //   untuk mengembalikan lebih bayar Maret; debit Rp X untuk kurang bayar).
        //   Sistem hanya MENCATATKAN (match/link) dan memberi riwayat di kedua
        //   transaksi + auto penyesuaian kas di bulan perbaikan.
        //
        // Alur (contoh lebih bayar DISHUB Maret: debit 11.501.601 vs BKU 11.501.600,
        // selisih +1; bank koreksi kredit Rp 1 di Agustus):
        //   1) indukRow   = baris Maret  (SELISIH_MATCHED, is_matched=true, selisih != 0)
        //   2) korekRow   = baris Agustus (baris perbaikan bank, kredit Rp 1)
        //   3) validasi matematis (immutable): tidak ada nilai yang diubah; cocokkan
        //      arah & besaran baris koreksi terhadap selisih induk.
        //   4) buat data_penyesuaian MASUK (lebih/kredit) / KELUAR (kurang/debit)
        //      di bulan perbaikan → mencatat kas riil (BKU Agustus seimbang).
        //   5) baris induk Maret: catatan_selisih di-append riwayat; selisih_nilai
        //      & is_matched DIBIARKAN (Rekon Maret tetap jujur "+1 sudah dikoreksi").
        //   6) baris koreksi Agustus: is_matched=true, match_type=KOREKSI_BANK,
        //      ref_bku_id=UUID penyesuaian, selisih_nilai=0, riwayat di-append.
        //   7) induk BKU (SP2D/potongan): keterangan_rekon di-append riwayat;
        //      selisih_rekon DIBIARKAN (tetap +1).
        //   8) seluruhnya diikat surat koreksi (jenis PENUTUP_SELISIH) utk audit.
        // ═══════════════════════════════════════════════════════════════════════
        const isSelisihMatched =
          !!bankRow && bankRow.is_matched && Math.abs(Number(bankRow.selisih_nilai || 0)) > 0.005;

        // Baris koreksi kedua (baru, dari rekening koran periode berikutnya)
        const korekRow = ref_bank_koreksi_id
          ? await tx.bank_statement.findUnique({ where: { id: parseInt(ref_bank_koreksi_id, 10) } })
          : null;

        if (jenis_koreksi === JenisKoreksi.PENUTUP_SELISIH) {
          if (!bankRow) throw new Error('Baris bank induk (selisih) wajib untuk PENUTUP_SELISIH.');
          if (!isSelisihMatched) throw new Error('Baris bank induk harus berstatus selisih (SELISIH_MATCHED).');
          if (!korekRow) throw new Error('Baris perbaikan bank (koreksi) wajib dipilih.');
          if (korekRow.id === bankRow.id) throw new Error('Baris induk dan baris koreksi tidak boleh sama.');
          if (!id_sumber_dana) throw new Error('Sumber dana wajib untuk penyesuaian kas PENUTUP_SELISIH.');

          const admin = req.user?.username || 'SYSTEM';
          const tglKoreksi = new Date().toISOString().slice(0, 10);
          const tanggalPerbaikan = new Date(korekRow.tanggal) || tanggalTransaksi;

          const indukNilaiDebet = Number(bankRow.debet || 0);
          const indukNilaiKredit = Number(bankRow.kredit || 0);
          const selisihLama = Number(bankRow.selisih_nilai || 0);
          const refBku = bankRow.ref_bku_id;

          // Nilai koreksi bank yang tercatat (baris perbaikan bank)
          const korekNilaiDebet = Number(korekRow.debet || 0);
          const korekNilaiKredit = Number(korekRow.kredit || 0);
          const korekIsDebet = korekNilaiDebet > 0;
          const korekNilai = korekIsDebet ? korekNilaiDebet : korekNilaiKredit;

          // Validasi arah & besaran (matematis, immutable):
          //   selisih > 0 (LEBIH bayar)  → bank koreksi KELUAR KAS (kredit) sebesar |selisih|
          //   selisih < 0 (KURANG bayar) → bank koreksi MASUK KAS (debit) sebesar |selisih|
          const selisihAbs = Math.abs(selisihLama);
          const tolerance = 0.01;
          if (selisihLama > 0 && !korekIsDebet && korekNilaiKredit > 0) {
            // kredit → benar (lebih bayar dikembalikan)
          } else if (selisihLama < 0 && korekIsDebet) {
            // debit → benar (kurang bayar ditagih tambahan)
          } else {
            throw new Error(
              `Arah koreksi bank tidak sesuai: selisih Rp ${selisihLama} (${selisihLama > 0 ? 'LEBIH → butuh baris KREDIT' : 'KURANG → butuh baris DEBIT'}). Baris terpilih: ${korekIsDebet ? `DEBIT ${korekNilaiDebet}` : `KREDIT ${korekNilaiKredit}`}.`
            );
          }
          if (Math.abs(korekNilai - selisihAbs) > tolerance) {
            throw new Error(
              `Nilai baris perbaikan bank (Rp ${korekNilai}) tidak sama dengan selisih induk (Rp ${selisihAbs}).`
            );
          }

          // Auto penyesuaian kas di bulan perbaikan (Agustus)
          const adjId = `ADJ-KB-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
          const penyesuaianJenis = selisihLama > 0 ? 'MASUK' : 'KELUAR';
          const adj = await tx.data_penyesuaian.create({
            data: {
              id: adjId,
              tanggal: tanggalPerbaikan,
              jenis: penyesuaianJenis,
              sisi_pengaruh: 'BUKU',
              uraian: `[Koreksi Bank ${nomor_surat}] Penutup selisih ${selisihLama > 0 ? 'LEBIH' : 'KURANG'} ${refBku || ''} — koreksi bank ${korekIsDebet ? `debit ${korekNilaiDebet}` : `kredit ${korekNilaiKredit}`} (baris bank #${korekRow.id}, ${new Date(korekRow.tanggal).toISOString().slice(0, 10)}).`,
              id_sumber_dana,
              nilai: Math.abs(selisihLama),
              user_pelaksana: admin,
              ref_koreksi_bank: detailId,
            },
          });

          // Jurnal otomatis untuk penyesuaian penutup selisih (akrual)
          await processPenyesuaianJournal({
            id: adjId,
            tanggal: tanggalPerbaikan,
            jenis: penyesuaianJenis,
            nilai: Math.abs(selisihLama),
            id_sumber_dana,
            uraian,
            nomor_surat,
          }, tx);

          // Riwayat pada BARIS INDUK (Maret) — nilai & status DIBIARKAN
          await tx.bank_statement.update({
            where: { id: bankRow.id },
            data: {
              resolved_at: new Date(),
              catatan_selisih: [
                bankRow.catatan_selisih || null,
                `[KOREKSI ${tglKoreksi} surat ${nomor_surat}] selisih ${selisihLama > 0 ? 'LEBIH' : 'KURANG'} Rp ${selisihAbs.toLocaleString('id-ID')} DITUTUP: koreksi bank ${korekIsDebet ? `debit ${korekNilaiDebet.toLocaleString('id-ID')}` : `kredit ${korekNilaiKredit.toLocaleString('id-ID')}`} (baris #${korekRow.id}, tgl ${new Date(korekRow.tanggal).toISOString().slice(0, 10)}), penyesuaian ${penyesuaianJenis} ${adjId}. Nilai mutasi ini TIDAK diubah (immutable). Pelaksana: ${admin}`,
              ].filter(Boolean).join(' | '),
            },
          });

          // Riwayat pada BARIS KOREKSI (Agustus) + link ke penyesuaian
          await tx.bank_statement.update({
            where: { id: korekRow.id },
            data: {
              is_matched: true,
              match_type: 'KOREKSI_BANK',
              ref_bku_id: adjId,
              selisih_nilai: 0,
              catatan_selisih: [
                korekRow.catatan_selisih || null,
                `[KOREKSI ${tglKoreksi} surat ${nomor_surat}] baris ini menutup selisih induk #${bankRow.id} (${refBku || ''}, selisih lama Rp ${selisihLama.toLocaleString('id-ID')}) lewat penyesuaian ${penyesuaianJenis} ${adjId}. Pelaksana: ${admin}`,
              ].filter(Boolean).join(' | '),
            },
          });

          // Riwayat pada INDUK BKU (SP2D/potongan) — selisih_rekon DIBIARKAN
          const catatanInduk = `[KOREKSI ${tglKoreksi} surat ${nomor_surat}] selisih ${selisihLama > 0 ? 'LEBIH' : 'KURANG'} Rp ${selisihAbs.toLocaleString('id-ID')} telah DIPERBAIKI bank di ${new Date(tanggalPerbaikan).toISOString().slice(0, 10)} (baris bank #${korekRow.id}: ${korekIsDebet ? `debit ${korekNilaiDebet.toLocaleString('id-ID')}` : `kredit ${korekNilaiKredit.toLocaleString('id-ID')}`}), penyesuaian ${penyesuaianJenis} ${adjId}. Selisih rekon Maret tetap tercatat). Pelaksana: ${admin}`;
          if (refBku && refBku.startsWith('SP2D-')) {
            const sp2d = await tx.data_sp2d.findUnique({ where: { id: refBku } });
            if (sp2d) {
              await tx.data_sp2d.update({
                where: { id: refBku },
                data: {
                  keterangan_rekon: [sp2d.keterangan_rekon || null, catatanInduk].filter(Boolean).join(' | '),
                },
              });
            }
          } else if (refBku) {
            const pot = await tx.data_sp2d_potongan.findUnique({ where: { id: refBku } });
            if (pot) {
              await tx.data_sp2d_potongan.update({
                where: { id: refBku },
                data: {
                  keterangan_rekon: [pot.keterangan_rekon || null, catatanInduk].filter(Boolean).join(' | '),
                },
              });
            }
          }

          // Simpan snapshot utk VOID + tandai APPLIED
          // ref_sp2d_id HANYA diisi bila induk SP2D (FK REFERENCES data_sp2d(id)).
          const refSp2dFinal = refBku && refBku.startsWith('SP2D-') ? refBku : null;
          const snap = JSON.stringify({
            t: 'PENUTUP_SELISIH',
            indukBankId: bankRow.id,
            koreksiBankId: korekRow.id,
            selisihLama,
            selisihAbs,
            lebih: selisihLama > 0,
            korekIsDebet,
            refBku,
            sp2dId: refBku && refBku.startsWith('SP2D-') ? refBku : null,
            potonganId: refBku && !refBku.startsWith('SP2D-') ? refBku : null,
            adjId,
            adjTanggal: tanggalPerbaikan,
            adjSumberDana: id_sumber_dana,
            adjJenis: penyesuaianJenis,
          });
          await tx.detail_koreksi_bank.update({
            where: { id: detailId },
            data: {
              status: 'APPLIED',
              ref_penyesuaian_id: adjId,
              uraian: `${uraian} [SNAP]${snap}`,
              ...(refSp2dFinal ? { ref_sp2d_id: refSp2dFinal } : { ref_sp2d_id: null }),
            },
          });

          createdDetails.push(await tx.detail_koreksi_bank.findUnique({ where: { id: detailId } }));
          continue;
        }

        if (jenis_koreksi === JenisKoreksi.PEMINDAHBUKUAN_TANPA_SP2D) {
          // Skenario C: Buat penyesuaian KELUAR + auto-match bank debet
          if (!id_sumber_dana) throw new Error('id_sumber_dana wajib untuk PEMINDAHBUKUAN_TANPA_SP2D');

          const adjId = `ADJ-KB-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
          const adj = await tx.data_penyesuaian.create({
            data: {
              id: adjId,
              tanggal: tanggalTransaksi,
              jenis: 'KELUAR',
              sisi_pengaruh: 'BUKU',
              uraian: `[Koreksi Bank: ${nomor_surat}] ${uraian}`,
              id_sumber_dana,
              nilai: parseFloat(nilai),
              user_pelaksana: req.user?.username || 'admin',
              ref_koreksi_bank: detailId,
            },
          });

          // Jurnal otomatis untuk penyesuaian KELUAR (pemindahbukuan tanpa SP2D)
          await processPenyesuaianJournal({
            id: adjId,
            tanggal: tanggalTransaksi,
            jenis: 'KELUAR',
            nilai: parseFloat(nilai),
            id_sumber_dana,
            uraian,
            nomor_surat,
          }, tx);

          // Link bank_statement → penyesuaian
          if (ref_bank_id) {
            await tx.bank_statement.update({
              where: { id: parseInt(ref_bank_id, 10) },
              data: {
                is_matched: true,
                match_type: 'KOREKSI_BANK',
                ref_bku_id: adjId,
                catatan_selisih: `Koreksi dari surat ${nomor_surat}`,
                selisih_nilai: 0,
              },
            });
          }

          await tx.detail_koreksi_bank.update({
            where: { id: detailId },
            data: { ref_penyesuaian_id: adjId, status: 'APPLIED' },
          });

          createdDetails.push({ ...detail, ref_penyesuaian_id: adjId });

        } else if (jenis_koreksi === JenisKoreksi.KURANG_TRANSFER) {
          // Skenario A: Bank kurang bayar → lalu transfer ulang
          // Link bank debet koreksi ke SP2D yang sama via matchMultiple logic
          if (!ref_sp2d_id) throw new Error('ref_sp2d_id wajib untuk KURANG_TRANSFER');

          const sp2d = await tx.data_sp2d.findUnique({ where: { id: ref_sp2d_id } });
          if (!sp2d) throw new Error(`SP2D ${ref_sp2d_id} tidak ditemukan`);

          // Deteksi BASIS selisih terbuka milik SP2D ini (keputusan user Ags 2026):
          // - LANGSUNG : baris selisih induk menunjuk id SP2D (vendor kurang bayar) → math vendor-neto
          // - POTONGAN : baris selisih induk menunjuk id potongan (gelondongan kurang) → header SP2D di-nol-kan
          const openSelForBasis = await findOpenSelisihBankRowsForSp2d(tx, ref_sp2d_id);
          const basisLangsung = openSelForBasis.some((b) => b.ref_bku_id === ref_sp2d_id)
            || !openSelForBasis.some((b) => b.ref_bku_id !== ref_sp2d_id);

          // Calculate neto SP2D — BUGFIX Ags 2026: `keterangan: { not: 'AUTO_HEADER' }`
          // membuang baris keterangan NULL (NULL <> 'x' = unknown di SQL) sehingga
          // potongan tanpa keterangan hilang dari sum → neto menggelembung (kasus -2.146.502).
          const potonganSum = await tx.data_sp2d_potongan.aggregate({
            where: {
              id_sp2d: ref_sp2d_id,
              OR: [{ keterangan: null }, { keterangan: { not: 'AUTO_HEADER' } }],
            },
            _sum: { nilai: true },
          });
          const sp2dNeto = Number(sp2d.nilai_bruto) - Number(potonganSum._sum.nilai || sp2d.nilai_potongan || 0);

          // If bank debet koreksi provided, link it to SP2D
          if (ref_bank_id) {
            // Link baris koreksi: selisih_nilai = 0 — ia baris PEMBAYARAN, bukan baris selisih
            // (BUGFIX Ags 2026: sebelumnya selisih computed ikut ditulis ke sini).
            await tx.bank_statement.update({
              where: { id: parseInt(ref_bank_id, 10) },
              data: {
                is_matched: true,
                match_type: 'KOREKSI_BANK',
                ref_bku_id: ref_sp2d_id,
                catatan_selisih: `Koreksi kurang transfer surat ${nomor_surat}`,
                selisih_nilai: 0,
              },
            });

            // BUGFIX Ags 2026: totalMatched = SEMUA baris matched SP2D (debet - kredit),
            // bukan findFirst satu baris — konsisten dengan path LEBIH_TRANSFER.
            const allMatchedBanks = await tx.bank_statement.findMany({
              where: { ref_bku_id: ref_sp2d_id, is_matched: true },
            });
            const totalBankValue = allMatchedBanks.reduce((sum, b) => {
              return sum + Number(b.debet || 0) - Number(b.kredit || 0);
            }, 0);
            const diff = Math.round(totalBankValue * 100) - Math.round(sp2dNeto * 100);
            const selisih = diff !== 0 ? diff / 100 : 0;

            // Update SP2D rekon — basis POTONGAN: selisih hidup di potongan + induk
            // resolved, header DI-NOL-KAN; basis LANGSUNG: residual math vendor.
            // keterangan_rekon DI-APPEND (bukan overwrite) agar marker "Catatan Admin:"
            // dari labeling historis tidak hilang — item tetap terbaca Q6/BAR bulan asal.
            await tx.data_sp2d.update({
              where: { id: ref_sp2d_id },
              data: {
                status_rekon: 'SUDAH',
                selisih_rekon: basisLangsung ? selisih : 0,
                keterangan_rekon: [sp2d.keterangan_rekon || null, `[Koreksi Bank: ${nomor_surat}] ${uraian}`].filter(Boolean).join(' | '),
                tanggal_pencairan: sp2d.tanggal_pencairan || tanggalTransaksi,
              },
            });
          }

          // Tandai baris selisih induk (bulan asal) yang masih terbuka sbg DITUTUP
          const kurangOpenSel = await findOpenSelisihBankRowsForSp2d(tx, ref_sp2d_id);
          if (kurangOpenSel.length) {
            await tx.bank_statement.updateMany({
              where: { id: { in: kurangOpenSel.map((b) => b.id) } },
              data: { resolved_at: new Date() },
            });
          }

          await tx.detail_koreksi_bank.update({
            where: { id: detailId },
            data: { status: 'APPLIED' },
          });

          createdDetails.push(detail);

        } else if (jenis_koreksi === JenisKoreksi.LEBIH_TRANSFER) {
          // Skenario B: Bank lebih bayar → reversal
          if (!ref_sp2d_id) throw new Error('ref_sp2d_id wajib untuk LEBIH_TRANSFER');

          const sp2d = await tx.data_sp2d.findUnique({ where: { id: ref_sp2d_id } });
          if (!sp2d) throw new Error(`SP2D ${ref_sp2d_id} tidak ditemukan`);

          // Deteksi basis selisih (sama dgn path KURANG): POTONGAN → header SP2D di-nol-kan
          const openSelForBasis = await findOpenSelisihBankRowsForSp2d(tx, ref_sp2d_id);
          const basisLangsung = openSelForBasis.some((b) => b.ref_bku_id === ref_sp2d_id)
            || !openSelForBasis.some((b) => b.ref_bku_id !== ref_sp2d_id);

          // Link bank kredit reversal to SP2D
          if (ref_bank_id) {
            await tx.bank_statement.update({
              where: { id: parseInt(ref_bank_id, 10) },
              data: {
                is_matched: true,
                match_type: 'KOREKSI_BANK',
                ref_bku_id: ref_sp2d_id,
                catatan_selisih: `Koreksi lebih transfer surat ${nomor_surat}`,
                selisih_nilai: 0,
              },
            });

            // Recalculate SP2D selisih: find all matched banks for this SP2D
            const allMatchedBanks = await tx.bank_statement.findMany({
              where: { ref_bku_id: ref_sp2d_id, is_matched: true },
            });
            const totalBankValue = allMatchedBanks.reduce((sum, b) => {
              return sum + Number(b.debet || 0) - Number(b.kredit || 0);
            }, 0);

            // BUGFIX Ags 2026: aggregate harus memasukkan baris keterangan NULL
            const potonganSum = await tx.data_sp2d_potongan.aggregate({
              where: {
                id_sp2d: ref_sp2d_id,
                OR: [{ keterangan: null }, { keterangan: { not: 'AUTO_HEADER' } }],
              },
              _sum: { nilai: true },
            });
            const sp2dNeto = Number(sp2d.nilai_bruto) - Number(potonganSum._sum.nilai || sp2d.nilai_potongan || 0);

            const diff = Math.round(totalBankValue * 100) - Math.round(sp2dNeto * 100);
            const selisih = diff !== 0 ? diff / 100 : 0;

            // basis POTONGAN → header di-nol-kan; basis LANGSUNG → residual math vendor.
            // keterangan_rekon DI-APPEND (bukan overwrite) agar marker "Catatan Admin:"
            // dari labeling historis tidak hilang — item tetap terbaca Q6/BAR bulan asal.
            await tx.data_sp2d.update({
              where: { id: ref_sp2d_id },
              data: {
                status_rekon: 'SUDAH',
                selisih_rekon: basisLangsung ? selisih : 0,
                keterangan_rekon: [sp2d.keterangan_rekon || null, `[Koreksi Bank: ${nomor_surat}] ${uraian}`].filter(Boolean).join(' | '),
              },
            });
          }

          // Tandai baris selisih induk (bulan asal) yang masih terbuka sbg DITUTUP
          const lebihOpenSel = await findOpenSelisihBankRowsForSp2d(tx, ref_sp2d_id);
          if (lebihOpenSel.length) {
            await tx.bank_statement.updateMany({
              where: { id: { in: lebihOpenSel.map((b) => b.id) } },
              data: { resolved_at: new Date() },
            });
          }

          await tx.detail_koreksi_bank.update({
            where: { id: detailId },
            data: { status: 'APPLIED' },
          });

          createdDetails.push(detail);
        }
      }

      return { surat, details: createdDetails };
    });

    await auditService.logActivity(
      req, 'TAMBAH', 'KOREKSI_BANK',
      `Surat ${nomor_surat} | ${details.length} item | Total Rp ${result.surat.total_nilai.toLocaleString('id-ID')}`
    );

    res.status(201).json({ message: 'Koreksi bank berhasil disimpan.', data: result });
  } catch (err) {
    console.error('[KOREKSI_BANK] Error:', err.message);
    res.status(500).json({ message: err.message || 'Gagal menyimpan koreksi bank.' });
  }
};

/**
 * List surat koreksi bank (dengan filter).
 */
const listSuratKoreksi = async (req, res) => {
  const { tahun, bulan, status, page = 1, limit = 50 } = req.query;
  const where = {};

  if (status) where.status = status;
  if (tahun) {
    const startY = `${tahun}-01-01`;
    const endY = `${tahun}-12-31`;
    where.tanggal_surat = { gte: new Date(startY), lte: new Date(endY) };
  }
  if (bulan && tahun) {
    const startM = new Date(tahun, bulan - 1, 1);
    const endM = new Date(tahun, bulan, 0, 23, 59, 59);
    where.tanggal_surat = { gte: startM, lte: endM };
  }

  try {
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [data, total] = await Promise.all([
      prisma.surat_koreksi_bank.findMany({
        where,
        include: { details: true },
        orderBy: { created_at: 'desc' },
        skip,
        take: parseInt(limit),
      }),
      prisma.surat_koreksi_bank.count({ where }),
    ]);

    res.json({ data, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    console.error('[KOREKSI_BANK_LIST] Error:', err.message);
    res.status(500).json({ message: 'Gagal mengambil data koreksi bank.' });
  }
};

/**
 * Detail satu surat koreksi bank.
 */
const getSuratKoreksiById = async (req, res) => {
  const { id } = req.params;
  try {
    const surat = await prisma.surat_koreksi_bank.findUnique({
      where: { id },
      include: { details: true },
    });
    if (!surat) return res.status(404).json({ message: 'Surat koreksi bank tidak ditemukan.' });

    // Rekonstruksi ref_bank_koreksi_id untuk penghidupan form edit.
    // detail_koreksi_bank TIDAK menyimpan kolom ref_bank_koreksi_id; utk tipe
    // PENUTUP_SELISIH baris koreksi (perbaikan bank) disimpan di dalam snapshot
    // [SNAP] pada uraian. Parse di sini agar frontend dapat preload dropdown.
    const details = surat.details.map((d) => {
      let ref_bank_koreksi_id = null;
      if (d.jenis_koreksi === 'PENUTUP_SELISIH' && d.uraian && d.uraian.includes('[SNAP]')) {
        const i = d.uraian.indexOf('[SNAP]');
        try {
          const snap = JSON.parse(d.uraian.slice(i + 6));
          if (snap && snap.koreksiBankId) ref_bank_koreksi_id = String(snap.koreksiBankId);
        } catch {
          ref_bank_koreksi_id = null;
        }
      }
      return { ...d, ref_bank_koreksi_id };
    });

    res.json({ ...surat, details });
  } catch (err) {
    res.status(500).json({ message: 'Gagal mengambil data.' });
  }
};

/**
 * Void surat koreksi bank — balikkan semua efek.
 */
const voidSuratKoreksi = async (req, res) => {
  const { id } = req.params;
  try {
    const surat = await prisma.surat_koreksi_bank.findUnique({
      where: { id },
      include: { details: true },
    });
    if (!surat) return res.status(404).json({ message: 'Surat koreksi bank tidak ditemukan.' });
    if (surat.status === 'VOID') return res.status(400).json({ message: 'Surat sudah VOID.' });

    await prisma.$transaction(async (tx) => {
      for (const d of surat.details) {
        // ── PENUTUP_SELISIH rollback (immutable): lepas link + hapus penyesuaian ──
        const snapMatch = d.uraian && d.uraian.includes('[SNAP]')
          ? (() => {
              const i = d.uraian.indexOf('[SNAP]');
              try { return JSON.parse(d.uraian.slice(i + 6)); } catch { return null; }
            })()
          : null;
        if (snapMatch && snapMatch.t === 'PENUTUP_SELISIH') {
          const admin = req.user?.username || 'SYSTEM';
          const tglVoid = new Date().toISOString().slice(0, 10);
          const riwayatVoid = `[VOID ${tglVoid} surat ${surat.nomor_surat}] penutupan selisih dibatalkan. Pelaksana: ${admin}`;

          // Hapus penyesuaian kas yang dibuat (Agustus)
          const adjRefs = [];
          const adjRestore = await tx.data_penyesuaian.findMany({
            where: { ref_koreksi_bank: d.id },
            select: { id: true },
          });
          adjRefs.push(...adjRestore.map((a) => a.id));
          if (snapMatch.adjId) adjRefs.push(snapMatch.adjId);

          await tx.data_penyesuaian.deleteMany({ where: { ref_koreksi_bank: d.id } });
          if (snapMatch.adjId) {
            await tx.data_penyesuaian.deleteMany({ where: { id: snapMatch.adjId } });
          }
          // Hapus jurnal penyesuaian terkait (key: ref_id)
          if (adjRefs.length) {
            await tx.jurnal_umum.deleteMany({ where: { ref_id: { in: adjRefs } } });
          }

          // Baris KOREKSI (Agustus): lepas link → kembali unmatched
          if (snapMatch.koreksiBankId) {
            const korekRow = await tx.bank_statement.findUnique({ where: { id: snapMatch.koreksiBankId } });
            await tx.bank_statement.update({
              where: { id: snapMatch.koreksiBankId },
              data: {
                is_matched: false,
                match_type: null,
                ref_bku_id: null,
                selisih_nilai: 0,
                catatan_selisih: [
                  korekRow?.catatan_selisih || null,
                  `[VOID ${tglVoid} surat ${surat.nomor_surat}] link penutup selisih dilepas; baris kembali unmatched. Pelaksana: ${admin}`,
                ].filter(Boolean).join(' | '),
              },
            });
          }

          // Baris INDUK (Maret): hanya tambah riwayat void (nilai/status/selisih tetap → Rekon Maret tetap jujur +1)
          if (snapMatch.indukBankId) {
            const indukRow = await tx.bank_statement.findUnique({ where: { id: snapMatch.indukBankId } });
            await tx.bank_statement.update({
              where: { id: snapMatch.indukBankId },
              data: {
                resolved_at: null,
                catatan_selisih: [
                  indukRow?.catatan_selisih || null,
                  riwayatVoid,
                ].filter(Boolean).join(' | '),
              },
            });
          }

          // INDUK BKU (SP2D/potongan): tambah riwayat void (selisih_rekon tetap)
          if (snapMatch.sp2dId) {
            const sp2d = await tx.data_sp2d.findUnique({ where: { id: snapMatch.sp2dId } });
            if (sp2d) {
              await tx.data_sp2d.update({
                where: { id: snapMatch.sp2dId },
                data: {
                  keterangan_rekon: [sp2d.keterangan_rekon || null, riwayatVoid].filter(Boolean).join(' | '),
                },
              });
            }
          } else if (snapMatch.potonganId) {
            const pot = await tx.data_sp2d_potongan.findUnique({ where: { id: snapMatch.potonganId } });
            if (pot) {
              await tx.data_sp2d_potongan.update({
                where: { id: snapMatch.potonganId },
                data: {
                  keterangan_rekon: [pot.keterangan_rekon || null, riwayatVoid].filter(Boolean).join(' | '),
                },
              });
            }
          }
          continue;
        }

        if (d.jenis_koreksi === 'PEMINDAHBUKUAN_TANPA_SP2D' && d.ref_penyesuaian_id) {
          // Delete penyesuaian
          await tx.data_penyesuaian.deleteMany({ where: { ref_koreksi_bank: d.id } });
          // Hapus jurnal penyesuaian terkait (key: ref_id)
          await tx.jurnal_umum.deleteMany({ where: { ref_id: d.ref_penyesuaian_id } });

          // Unlink bank_statement
          if (d.ref_bank_id) {
            await tx.bank_statement.update({
              where: { id: d.ref_bank_id },
              data: { is_matched: false, match_type: null, ref_bku_id: null, catatan_selisih: null, selisih_nilai: 0 },
            });
          }
        } else if (d.jenis_koreksi === 'KURANG_TRANSFER' || d.jenis_koreksi === 'LEBIH_TRANSFER') {
          // Unlink bank_statement
          if (d.ref_bank_id) {
            await tx.bank_statement.update({
              where: { id: d.ref_bank_id },
              data: { is_matched: false, match_type: null, ref_bku_id: null, catatan_selisih: null, selisih_nilai: 0 },
            });
          }
          // Reset SP2D rekon if linked
          if (d.ref_sp2d_id) {
            await tx.data_sp2d.update({
              where: { id: d.ref_sp2d_id },
              data: { status_rekon: 'BELUM', selisih_rekon: 0, keterangan_rekon: null },
            });
            // Lepas penanda DITUTUP pada baris selisih induk (bulan asal)
            const pots = await tx.data_sp2d_potongan.findMany({
              where: { id_sp2d: d.ref_sp2d_id },
              select: { id: true },
            });
            const refs = [d.ref_sp2d_id, ...pots.map((p) => p.id)].filter(Boolean);
            if (refs.length) {
              await tx.bank_statement.updateMany({
                where: { ref_bku_id: { in: refs }, resolved_at: { not: null } },
                data: { resolved_at: null },
              });
            }
          }
        }
      }

      // Mark semua detail surat ini sbg VOID (BUGFIX Ags 2026: sebelumnya hanya
      // surat-level yang berubah — detail tetap APPLIED selamanya di DB).
      await tx.detail_koreksi_bank.updateMany({
        where: { id_surat: id },
        data: { status: 'VOID' },
      });

      // Mark surat as VOID
      await tx.surat_koreksi_bank.update({
        where: { id },
        data: { status: 'VOID' },
      });
    });

    await auditService.logActivity(req, 'VOID', 'KOREKSI_BANK', `Surat ${surat.nomor_surat} di-VOID`);
    res.json({ message: 'Surat koreksi bank berhasil di-VOID.' });
  } catch (err) {
    console.error('[KOREKSI_BANK_VOID] Error:', err.message);
    res.status(500).json({ message: 'Gagal mem-VOID surat koreksi bank.' });
  }
};

/**
 * List SP2D yang RELEVAN sebagai referensi koreksi bank.
 *
 * SUMBER (sesuai aturan admin): SEMUA selisih yang TELAH DIBERIKAN CATATAN
 * OLEH ADMIN — yaitu baris `bank_statement` ber-`selisih_nilai != 0` yang
 * `catatan_selisih`-nya memuat "Catatan Admin" (mis. "Catatan Admin: Kurang
 * Transfer Bank"). Setiap bank selisih di-resolve ke SP2D induknya:
 *   - `ref_bku_id` = id `data_sp2d`                        -> SP2D tersebut
 *   - `ref_bku_id` = id `data_sp2d_potongan` (gelondongan) -> `id_sp2d` miliknya
 * sehingga TIDAK ada selisih ber-catatan-admin yang terlewat. Baris yang TIDAK
 * punya catatan admin (mis. `000031/GU`, selisih_rekon=0 tanpa catatan) TIDAK
 * muncul.
 *
 * Melengkapi tiap SP2D dgn: neto, total debit bank ter-link, selisih tersisa,
 * arah selisih (LEBIH/KURANG) + catatan selisih utk memandu pemilihan Jenis.
 */
const getSp2dCandidates = async (req, res) => {
  const { tahun } = req.query;
  try {
    const tanggalFilter = tahun
      ? { tanggal: { gte: new Date(`${tahun}-01-01`), lte: new Date(`${tahun}-12-31`) } }
      : {};

    // 1) Ambil SEMUA bank selisih yang sudah dicatat admin.
    const selisihBanks = await prisma.bank_statement.findMany({
      where: {
        is_matched: true,
        selisih_nilai: { not: 0 },
        // Catatan admin dicatat dalam catatan_selisih dengan penanda "Catatan:"
        // (mis. "Selisih KURANG Rp 20 [MANUAL] | Catatan: Kurang Transfer Bank").
        // resolved_at IS NULL → hanya selisih yang MASIH TERBUKA (belum ditutup koreksi).
        resolved_at: null,
        catatan_selisih: { contains: 'Catatan:', mode: 'insensitive' },
      },
      select: {
        id: true,
        ref_bku_id: true,
        tanggal: true,
        selisih_nilai: true,
        catatan_selisih: true,
      },
    });

    // 2) Resolve tiap bank selisih -> SP2D induk.
    //    Persiapkan pemetaan: ref_bku_id -> sp2dId. Bacaan melalui dua jalur:
    //    (a) ref yang merupakan id data_sp2d , (b) ref yang merupakan id potongan.
    const refIds = [...new Set(selisihBanks.map((b) => b.ref_bku_id).filter(Boolean))];
    const sp2dIdByRef = {};

    if (refIds.length) {
      const sp2dByRef = await prisma.data_sp2d.findMany({
        where: { id: { in: refIds } },
        select: { id: true },
      });
      for (const s of sp2dByRef) sp2dIdByRef[s.id] = s.id;

      // Ref potongan selalu UUID. Pisahkan agar query tidak gagal saat ref
      // berisi id SP2D berbentuk string "SP2D-...".
      const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const uuidRefs = refIds.filter((id) => uuidRe.test(id));
      if (uuidRefs.length) {
        const potsByRef = await prisma.data_sp2d_potongan.findMany({
          where: { id: { in: uuidRefs } },
          select: { id: true, id_sp2d: true },
        });
        for (const pt of potsByRef) sp2dIdByRef[pt.id] = pt.id_sp2d;
      }
    }

    const sp2dIdSet = new Set(
      selisihBanks.map((b) => sp2dIdByRef[b.ref_bku_id]).filter(Boolean)
    );
    const sp2dIds = [...sp2dIdSet];

    // 3) Ambil data SP2D induk.
    const sp2ds = sp2dIds.length
      ? await prisma.data_sp2d.findMany({
          where: { id: { in: sp2dIds }, ...tanggalFilter },
          orderBy: { tanggal: 'desc' },
          select: {
            id: true,
            nomor: true,
            tanggal: true,
            tanggal_pencairan: true,
            opd: true,
            penerima: true,
            nilai_bruto: true,
            nilai_potongan: true,
            nilai_neto: true,
            status_rekon: true,
            selisih_rekon: true,
          },
        })
      : [];

    if (!sp2ds.length) {
      res.json({ data: [] });
      return;
    }

    // 4) Agregasi bank selisih per SP2D (total selisih + arah + catatan).
    const selBySp2d = {};
    for (const b of selisihBanks) {
      const sp2dId = sp2dIdByRef[b.ref_bku_id];
      if (!sp2dId) continue;
      const entry = selBySp2d[sp2dId] || { total: 0, count: 0, catatan: [], direct: 0, potongan: 0 };
      entry.total += Number(b.selisih_nilai || 0);
      entry.count += 1;
      if (b.ref_bku_id === sp2dId) entry.direct += 1; else entry.potongan += 1;
      if (b.catatan_selisih && b.catatan_selisih !== entry.catatan[entry.catatan.length - 1]) {
        entry.catatan.push(b.catatan_selisih);
      }
      selBySp2d[sp2dId] = entry;
    }

    // 5) Total debit bank ter-link utk tiap SP2D (semua bank yg mengarah ke SP2D).
    const sumRes = await prisma.bank_statement.groupBy({
      by: ['ref_bku_id'],
      where: { ref_bku_id: { in: sp2dIds }, is_matched: true },
      _sum: { debet: true, kredit: true },
    });
    const bankSumById = {};
    for (const r of sumRes) {
      bankSumById[r.ref_bku_id] = Number(r._sum.debet || 0) - Number(r._sum.kredit || 0);
    }

    const data = sp2ds
      .map((s) => {
        const sSel = selBySp2d[s.id];
        const neto = Number(s.nilai_neto ?? (Number(s.nilai_bruto) - Number(s.nilai_potongan || 0)));
        const bankLinked = Number(bankSumById[s.id] || 0);
        // Selisih sebagai referensi utama = agregasi bank yg TELAH dicatat admin.
        const totalSelisih = sSel ? sSel.total : 0;
        const arah = totalSelisih < 0 ? 'KURANG' : 'LEBIH';
        return {
          id: s.id,
          nomor: s.nomor,
          tanggal: s.tanggal,
          tanggal_pencairan: s.tanggal_pencairan,
          opd: s.opd,
          penerima: s.penerima,
          nilai_bruto: Number(s.nilai_bruto),
          nilai_potongan: Number(s.nilai_potongan || 0),
          nilai_neto: neto,
          totalBankDebit: bankLinked,
          selisihTersisa: neto - bankLinked,
          status_rekon: s.status_rekon,
          selisih_rekon: totalSelisih,
          arah,
          basis: sSel && sSel.potongan > 0 && sSel.direct === 0 ? 'POTONGAN' : 'LANGSUNG',
          catatan_selisih: sSel ? sSel.catatan.join(' | ') : null,
        };
      })
      .filter((x) => x.arah);

    res.json({ data });
  } catch (err) {
    console.error('[KOREKSI_BANK_SP2D_CANDIDATES] Error:', err.message);
    res.status(500).json({ message: 'Gagal mengambil kandidat SP2D.' });
  }
};

/**
 * List bank_statement belum matched untuk dipilih sebagai link koreksi.
 */
const getBankCandidates = async (req, res) => {
  const { tahun, bulan, search } = req.query;

  // Kandidat mencakup DUA kelompok:
  //  1) UNMATCHED      : is_matched = false (belum punya pasangan).
  //  2) SELISIH_MATCHED: is_matched = true tetapi masih berselisih
  //     (selisih_nilai != 0). Inilah selisih yang sudah tercatat saat rekon
  //     namun perlu ditindaklanjuti/diperbaiki setelah bank mengoreksi
  //     rekening koran (mis. selisih Rp 1 / Rp 27 / Rp 20 / Rp 700).
  const where = { OR: [
    { is_matched: false },
    { is_matched: true, selisih_nilai: { not: 0 } },
  ] };

  if (tahun) {
    const startY = `${tahun}-01-01`;
    const endY = `${tahun}-12-31`;
    where.tanggal = { gte: new Date(startY), lte: new Date(endY) };
  }
  if (bulan && tahun) {
    const startM = new Date(tahun, bulan - 1, 1);
    const endM = new Date(tahun, bulan, 0, 23, 59, 59);
    where.tanggal = { gte: startM, lte: endM };
  }

  if (search) {
    where.AND = [
      {
        OR: [
          { deskripsi: { contains: search, mode: 'insensitive' } },
          { nomor_bukti: { contains: search, mode: 'insensitive' } },
        ],
      },
    ];
  }

  try {
    const rows = await prisma.bank_statement.findMany({
      where,
      orderBy: [{ tanggal: 'desc' }, { id: 'desc' }],
      take: 300,
      select: {
        id: true,
        tanggal: true,
        deskripsi: true,
        nomor_bukti: true,
        debet: true,
        kredit: true,
        is_matched: true,
        selisih_nilai: true,
        catatan_selisih: true,
        ref_bku_id: true,
      },
    });

    const data = rows.map((r) => {
      const selisih = Number(r.selisih_nilai || 0);
      const statusKandidat = r.is_matched && Math.abs(selisih) > 0.005
        ? 'SELISIH_MATCHED'
        : 'UNMATCHED';
      return {
        id: r.id,
        tanggal: r.tanggal,
        deskripsi: r.deskripsi,
        nomor_bukti: r.nomor_bukti,
        debet: r.debet,
        kredit: r.kredit,
        is_matched: r.is_matched,
        selisih_nilai: selisih,
        catatan_selisih: r.catatan_selisih,
        ref_bku_id: r.ref_bku_id,
        statusKandidat,
      };
    });

    res.json({ data });
  } catch (err) {
    console.error('[KOREKSI_BANK_CANDIDATES] Error:', err.message);
    res.status(500).json({ message: 'Gagal mengambil kandidat bank.' });
  }
};

// Heuristik pola deskripsi baris bank sebagai "perbaikan" atas selisih
// (cth. "PB KKURAGAN NILAI PJK GJI SP2D"). Saran, bukan silent-apply.
const isAutoDetectDesc = (d) => {
  const up = String(d || '').toUpperCase();
  const hasPb = up.includes('PB');
  const hasSp2d = up.includes('SP2D');
  const hasKeyword = ['KKURAGAN', 'KURANG', 'LEBIH', 'KOREKSI', 'NILAI', 'PAJAK'].some((k) => up.includes(k));
  return hasPb && hasSp2d && hasKeyword;
};

/**
 * Daftar "perbaikan bank" yang TERDETEKSI: baris bank masih UNMATCHED dengan
 * deskripsi & nilai yang cocok menutup selisih induk yang MASIH TERBUKA.
 * Hasilnya saran (belum diterapkan) — admin konfirmasi via /confirm.
 */
const getAutoDetectSuggestions = async (req, res) => {
  const { tahun, bulan } = req.query;
  try {
    // 1) Selisih induk yang MASIH TERBUKA (resolved_at IS NULL)
    const selisihBanks = await prisma.bank_statement.findMany({
      where: {
        is_matched: true,
        selisih_nilai: { not: 0 },
        resolved_at: null,
        catatan_selisih: { contains: 'Catatan:', mode: 'insensitive' },
      },
      select: { id: true, ref_bku_id: true, tanggal: true, selisih_nilai: true },
    });
    const refIds = [...new Set(selisihBanks.map((b) => b.ref_bku_id).filter(Boolean))];
    const sp2dIdByRef = {};
    if (refIds.length) {
      const sp2dByRef = await prisma.data_sp2d.findMany({ where: { id: { in: refIds } }, select: { id: true, nomor: true, opd: true, tanggal_pencairan: true } });
      for (const s of sp2dByRef) sp2dIdByRef[s.id] = { id: s.id, nomor: s.nomor, opd: s.opd, tanggal_pencairan: s.tanggal_pencairan };
      const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const uuidRefs = refIds.filter((id) => uuidRe.test(id));
      if (uuidRefs.length) {
        const pots = await prisma.data_sp2d_potongan.findMany({ where: { id: { in: uuidRefs } }, select: { id: true, id_sp2d: true } });
        const spMap = new Map((await prisma.data_sp2d.findMany({ where: { id: { in: pots.map((pt) => pt.id_sp2d) } }, select: { id: true, nomor: true, opd: true, tanggal_pencairan: true } })).map((s) => [s.id, { id: s.id, nomor: s.nomor, opd: s.opd, tanggal_pencairan: s.tanggal_pencairan }]));
        for (const pt of pots) {
          const sp = spMap.get(pt.id_sp2d);
          if (sp) sp2dIdByRef[pt.id] = sp;
        }
      }
    }

    const openSelisih = selisihBanks
      .map((b) => ({ bankId: b.id, ref: b.ref_bku_id, arah: Number(b.selisih_nilai) < 0 ? 'KURANG' : 'LEBIH', selisihAbs: Math.abs(Number(b.selisih_nilai || 0)), sp2d: sp2dIdByRef[b.ref_bku_id] || null }))
      .filter((s) => s.sp2d);

    if (!openSelisih.length) {
      res.json({ data: [], message: 'Tidak ada selisih terbuka.' });
      return;
    }

    // 2) Baris bank UNMATCHED dengan pola perbaikan
    const whereUnmatched = { is_matched: false };
    if (tahun) {
      const startY = `${tahun}-01-01`;
      const endY = `${tahun}-12-31`;
      whereUnmatched.tanggal = { gte: new Date(startY), lte: new Date(endY) };
    }
    if (bulan && tahun) {
      whereUnmatched.tanggal = {
        gte: new Date(tahun, bulan - 1, 1),
        lte: new Date(tahun, bulan, 0, 23, 59, 59),
      };
    }
    const unmatchedAll = await prisma.bank_statement.findMany({
      where: whereUnmatched,
      select: { id: true, tanggal: true, deskripsi: true, debet: true, kredit: true },
      orderBy: { tanggal: 'desc' },
      take: 2000,
    });
    const candidates = unmatchedAll.filter((r) => isAutoDetectDesc(r.deskripsi));
    if (!candidates.length) {
      res.json({ data: [], message: 'Tidak ada baris bank ber-pola perbaikan pada periode dipilih.' });
      return;
    }

    // 3) Cocokkan: arah & besar nilai baris == besar selisih terbuka
    const suggestions = [];
    const usedBank = new Set();
    for (const os of openSelisih) {
      const target = os.selisihAbs;
      const wantDebet = os.arah === 'KURANG';
      const match = candidates.find(
        (r) =>
          !usedBank.has(r.id) &&
          Math.abs(Number(wantDebet ? r.debet : r.kredit)) === target
      );
      if (match) {
        usedBank.add(match.id);
        suggestions.push({
          bankRowId: match.id,
          tanggalPerbaikan: match.tanggal,
          deskripsi: match.deskripsi,
          selisihBankId: os.bankId,
          sp2dId: os.sp2d.id,
          nomorSp2d: os.sp2d.nomor,
          opd: os.sp2d.opd,
          arah: os.arah,
          besar: target,
          rekomendasiJenis: os.arah === 'LEBIH' ? 'LEBIH_TRANSFER' : 'KURANG_TRANSFER',
        });
      }
    }

    res.json({ data: suggestions, message: suggestions.length ? `${suggestions.length} perbaikan terdeteksi.` : 'Perbaikan bank terdeteksi tetapi belum ada pencocokan nilai yang tepat.' });
  } catch (err) {
    console.error('[KOREKSI_BANK_AUTODETECT] Error:', err.message);
    res.status(500).json({ message: 'Gagal mendeteksi perbaikan bank.' });
  }
};

/**
 * Konfirmasi 1-klik: ubah satu saran auto-detect menjadi draft detail koreksi
 * bank (JENIS + SP2D + Ref Bank + Nilai) tanpa langsung menerapkan ke DB —
 * admin menyelesaikan & submit lewat alur koreksi bank normal.
 */
const confirmAutoDetect = async (req, res) => {
  const { bankRowId, sp2dId, arah, besar } = req.body;
  try {
    if (!bankRowId || !sp2dId || !arah) {
      return res.status(400).json({ message: 'bankRowId, sp2dId, dan arah wajib diisi.' });
    }
    const bank = await prisma.bank_statement.findUnique({
      where: { id: parseInt(bankRowId, 10) },
      select: { id: true, tanggal: true, deskripsi: true, debet: true, kredit: true },
    });
    if (!bank) return res.status(404).json({ message: 'Baris bank tidak ditemukan.' });
    const sp2d = await prisma.data_sp2d.findUnique({
      where: { id: sp2dId },
      select: { id: true, nomor: true },
    });
    if (!sp2d) return res.status(404).json({ message: 'SP2D tidak ditemukan.' });

    const nilai = Math.abs(Number(besar || (arah === 'KURANG' ? bank.debet : bank.kredit) || 0));
    const draft = {
      jenis_koreksi: arah === 'LEBIH' ? 'LEBIH_TRANSFER' : 'KURANG_TRANSFER',
      ref_sp2d_id: sp2d.id,
      ref_bank_id: String(bank.id),
      nilai: nilai.toFixed(2),
      uraian: `Koreksi ${arah === 'LEBIH' ? 'lebih' : 'kurang'} transfer — ${sp2d.nomor} (deteksi otomatis)`,
    };
    res.json({ data: draft });
  } catch (err) {
    console.error('[KOREKSI_BANK_AUTODETECT_CONFIRM] Error:', err.message);
    res.status(500).json({ message: 'Gagal membuat draft koreksi.' });
  }
};

/**
 * Peta selisih yang SUDAH DITUTUP (resolved_at != null) untuk badge "DITUTUP"
 * (discrepancy) + BAR period-aware — TANPA mengubah Q6 (LOCKED).
 * Tiap entry: resolvedAt, bulan (bulan perbaikan), selisihNilai (selisih asli
 * dari baris induk), perbaikanTanggal (tgl mutasi bank koreksi), nomorSurat.
 */
const getResolvedSelisihMap = async (req, res) => {
  const { tahun } = req.query;
  try {
    const year = tahun || new Date().getFullYear();
    const resolvedRows = await prisma.bank_statement.findMany({
      where: {
        is_matched: true,
        selisih_nilai: { not: 0 },
        resolved_at: { not: null },
        tanggal: { gte: new Date(`${year}-01-01`), lte: new Date(`${year}-12-31`) },
      },
      select: { id: true, ref_bku_id: true, resolved_at: true, tanggal: true, selisih_nilai: true },
    });
    if (!resolvedRows.length) {
      res.json({ bySp2d: {}, byPotongan: {} });
      return;
    }

    const refIds = [...new Set(resolvedRows.map((b) => b.ref_bku_id).filter(Boolean))];
    const refToSp2d = {};
    const potIds = new Set();
    const sp2dIdSet = new Set();
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    for (const id of refIds) {
      if (uuidRe.test(id)) potIds.add(id);
      else sp2dIdSet.add(id);
    }
    if (potIds.size) {
      const pots = await prisma.data_sp2d_potongan.findMany({ where: { id: { in: [...potIds] } }, select: { id: true, id_sp2d: true } });
      for (const pt of pots) {
        refToSp2d[pt.id] = pt.id_sp2d;
        sp2dIdSet.add(pt.id_sp2d);
      }
    }
    const sp2dIds = [...sp2dIdSet];

    // Akumulasi per ref: resolvedAt terawal + total selisih asli baris induk
    const acc = {};
    for (const b of resolvedRows) {
      const a = acc[b.ref_bku_id] || { resolvedAt: null, selisihNilai: 0 };
      if (!a.resolvedAt || new Date(b.resolved_at) < new Date(a.resolvedAt)) a.resolvedAt = b.resolved_at;
      a.selisihNilai += Number(b.selisih_nilai || 0);
      acc[b.ref_bku_id] = a;
    }

    // Info perbaikan per SP2D: tanggal mutasi bank koreksi (terakhir) + nomor surat
    const fixInfoBySp2d = {};
    if (sp2dIds.length) {
      const fixRows = await prisma.bank_statement.findMany({
        where: { match_type: 'KOREKSI_BANK', is_matched: true, ref_bku_id: { in: sp2dIds } },
        select: { ref_bku_id: true, tanggal: true },
      });
      for (const f of fixRows) {
        const cur = fixInfoBySp2d[f.ref_bku_id];
        if (!cur || !cur.perbaikanTanggal || new Date(f.tanggal) > new Date(cur.perbaikanTanggal)) {
          fixInfoBySp2d[f.ref_bku_id] = { ...(cur || {}), perbaikanTanggal: f.tanggal };
        }
      }
      const surats = await prisma.surat_koreksi_bank.findMany({
        where: {
          details: {
            some: { ref_sp2d_id: { in: sp2dIds }, status: 'APPLIED', jenis_koreksi: { in: ['KURANG_TRANSFER', 'LEBIH_TRANSFER'] } },
          },
        },
        select: {
          nomor_surat: true,
          details: {
            where: { status: 'APPLIED', jenis_koreksi: { in: ['KURANG_TRANSFER', 'LEBIH_TRANSFER'] } },
            select: { ref_sp2d_id: true },
          },
        },
        orderBy: { created_at: 'desc' },
      });
      for (const s of surats) {
        for (const d of s.details) {
          if (d.ref_sp2d_id && !fixInfoBySp2d[d.ref_sp2d_id]?.nomorSurat) {
            fixInfoBySp2d[d.ref_sp2d_id] = { ...(fixInfoBySp2d[d.ref_sp2d_id] || {}), nomorSurat: s.nomor_surat };
          }
        }
      }
    }

    const buildEntry = (ref) => {
      const a = acc[ref];
      const fix = fixInfoBySp2d[refToSp2d[ref] || ref] || {};
      return {
        resolvedAt: a.resolvedAt,
        bulan: a.resolvedAt ? new Date(a.resolvedAt).getMonth() + 1 : null,
        selisihNilai: a.selisihNilai,
        perbaikanTanggal: fix.perbaikanTanggal || null,
        nomorSurat: fix.nomorSurat || null,
      };
    };

    const bySp2d = {};
    const byPotongan = {};
    for (const ref of Object.keys(acc)) {
      if (refToSp2d[ref]) {
        if (!byPotongan[ref]) byPotongan[ref] = buildEntry(ref);
        if (!bySp2d[refToSp2d[ref]]) bySp2d[refToSp2d[ref]] = buildEntry(ref);
      } else if (!bySp2d[ref]) {
        bySp2d[ref] = buildEntry(ref);
      }
    }

    const serialize = (o) => {
      const out = {};
      for (const [k, v] of Object.entries(o)) {
        out[k] = {
          resolvedAt: v.resolvedAt instanceof Date ? v.resolvedAt.toISOString() : v.resolvedAt,
          bulan: v.bulan,
          selisihNilai: v.selisihNilai,
          perbaikanTanggal: v.perbaikanTanggal instanceof Date ? v.perbaikanTanggal.toISOString() : v.perbaikanTanggal,
          nomorSurat: v.nomorSurat,
        };
      }
      return out;
    };

    res.json({ bySp2d: serialize(bySp2d), byPotongan: serialize(byPotongan) });
  } catch (err) {
    console.error('[KOREKSI_BANK_RESOLVED_MAP] Error:', err.message);
    res.status(500).json({ message: 'Gagal memuat status selisih ditutup.' });
  }
};

module.exports = {
  createSuratKoreksi,
  listSuratKoreksi,
  getSuratKoreksiById,
  voidSuratKoreksi,
  getBankCandidates,
  getSp2dCandidates,
  getAutoDetectSuggestions,
  confirmAutoDetect,
  getResolvedSelisihMap,
};
