# PROJECT KNOWLEDGE BASE: DSS BPKAD
> Referensi komprehensif untuk Claude. Berisi profil aplikasi, arsitektur, logika bisnis, standar, dan riwayat update lengkap. Diperbarui terakhir: 2026-05-18.

---

## 1. PROFIL PROYEK

- **Nama**: DSS BPKAD — Decision Support System, Badan Pengelola Keuangan dan Aset Daerah Kab. Kepulauan Aru
- **Fungsi Inti**: Digitalisasi kearsipan keuangan daerah (SP2D, Pendapatan, Pajak) + Rekonsiliasi BKU (Buku Kas Umum) vs Rekening Koran Bank secara real-time
- **Stack**: Express 5 + Prisma 6 + PostgreSQL (Backend) | Next.js 16.2.4 + React 19 + TypeScript 5 + Tailwind 4 (Frontend)
- **Port**: Backend :5000 | Frontend :3000
- **AI**: OpenRouter (deepseek-chat) sebagai primer — Google Gemini sebagai fallback
- **Zona Waktu Operasional**: GMT+9 (WIT — Waktu Indonesia Timur)
- **Script Launcher**: `run_app.bat` di root repo (jalankan backend + frontend sekaligus)
- **Struktur Repo**: Monorepo tanpa root package.json. `backend/` = Express API. `frontend/` = Next.js live. `bpkad-dss-frontend/` = scaffold kosong, abaikan.

---

## 2. ARSITEKTUR BACKEND

```
server.js → 7 route modules (semua prefix /api):

  /api/auth       → authRoutes.js       → authController.js
  /api/sp2d       → sp2dRoutes.js       → sp2dController.js
  /api/pendapatan → pendapatanRoutes.js → pendapatanController.js
  /api/dss        → dssRoutes.js        → dssController.js, simulatorController.js,
                                           talanganController.js, penyesuaianController.js,
                                           saldoAwalController.js, setoranPajakController.js,
                                           intelligenceController.js
  /api/reports    → reportRoutes.js     → reconciliationController.js, reportController.js
  /api/admin      → adminRoutes.js      → referenceController.js, systemController.js
  /api/bku        → bkuRoutes.js        → bkuController.js

Layering: routes → authMiddleware (JWT Bearer, req.user) → controllers → services/utils
Services: aiService.js, auditService.js, dssService.js
Utils: accountingEngine, dateUtils (fmtDateWIT GMT+9), reconciliationHelpers
```

**Hal penting yang sering membingungkan:**
- `reconciliationController` diakses di `/api/reports/reconciliation/*` — BUKAN `/api/dss/*`
- `Prisma` adalah satu-satunya ORM yang dipakai controller. `backend/config/db.js` (raw pg Pool) adalah LEGACY, tidak dipakai
- TIDAK ADA Prisma migrations. Schema DB = `backend/database/init.sql`. `schema.prisma` = refleksi saja — edit schema.prisma tanpa `prisma db push` tidak mengubah DB
- Untuk schema change: update `init.sql` + `prisma db push` + `npx prisma generate`

---

## 3. SEMUA CONTROLLER & FUNGSI KUNCI

### sp2dController.js
- `createSp2d` — validasi pagu + likuiditas + talangan prompt jika shortfall
- `updateSp2d`, `deleteSp2d`, `getSp2dList`, `getSp2dById`
- `importSp2dExcel` — multer upload + batch insert
- `getPotongan`, `createPotongan`, `updatePotongan`
- `getMissingPencairanStats` → `GET /sp2d/missing-pencairan/stats` [BARU 2026-05-18]
- `getMissingPencairan` → `GET /sp2d/missing-pencairan` [BARU 2026-05-18]
- `updateTanggalPencairanBulk` → `PUT /sp2d/missing-pencairan/bulk` [BARU 2026-05-18]

### reconciliationController.js [CRITICAL_LOGIC]
- `runMagicMatch` → `/reports/reconciliation/match`
- `bulkMatchSmart` → `/reports/reconciliation/match-smart`
- `getSuggestions` → `/reports/reconciliation/suggestions`
- `unmatchTransaction` → `/reports/reconciliation/unmatch`
- Helpers: `isValidUuid`, `fmtDateWIT`, `extractNumericTokens`, `computeUraianScore` (0–320 poin), `computeNomorBuktiScore` (0–250 poin)
- **CATATAN**: `calculateSimilarityScore` SUDAH DIHAPUS per 2026-05-16

### reportController.js [CRITICAL_LOGIC]
- `getBKU` → `/reports/bku` — BKU dengan SUDAH_BRUTO support, multiformat query params
- `getReconciliationData` → `/reports/reconciliation/data`
- `getAnomalies` → `/reports/reconciliation/anomalies`
- `getDiscrepancyReport` → `/reports/reconciliation/discrepancy`

### bkuController.js
- `getBku` → `/bku` — raw SQL UNION: pendapatan + sp2d + potongan + penyesuaian + setoran_pajak

### pendapatanController.js
- `createPendapatan` — auto nomor_bukti jika kosong, SiLPA force ke Jan 1, posting jurnal umum, auto-settle talangan
- `getPendapatanList`, `updatePendapatan`, `deletePendapatan`, `importExcel`

### dssController.js
- `getDashboardAnalytics` — kas fisik, talangan, kas efektif
- `getSumberDana`, `getLogs` (100 terakhir), `upsertPagu`

### intelligenceController.js
- `getIntelligenceReport` — Midnight Audit, Triple-Lock validation, compliance score
- `chatWithAI` — Bro Jenius, context injection + DeepSeek primary + Gemini fallback

### talanganController.js
- `getTalanganList`, `createTalanganManual`, `settleTalanganManual`, `assignSumberTalangan`

### setoranPajakController.js
- `createSetoranPajak` — NTPN, skipDuplicate flag
- `getSetoranPajakList` — paginated, search by nomor_bukti/uraian/opd

### systemController.js
- `purgeAllData` — DESTRUCTIVE: truncate 12 tabel. Butuh special PIN. Admin only.

### authController.js
- `login`, `register`, `updatePin` — JWT 8h expiry, bcrypt password

### referenceController.js
- `getOPD`, `createOPD`, `updateOPD`, `deleteOPD`
- `getJenis`, `createJenis`, `deleteJenis` — master jenis belanja

---

## 4. SKEMA DATABASE (MODEL KUNCI)

```
users
  id(UUID), username(unique), password_hash, role, special_pin(default "1234")

master_sumber_dana
  id(VARCHAR 50), nama, kategori, nomor_rekening
  → relasi ke hampir semua tabel transaksi

data_sp2d
  nomor(unique), tanggal, tanggal_pencairan(NULLABLE!), opd, jenis, penerima
  nilai_bruto, nilai_potongan, nilai_neto, status_dana, status_rekon
  → detail_sp2d[] (alokasi per sumber dana)
  → data_sp2d_potongan[] (rincian potongan — INDEPENDEN)

detail_sp2d
  id(UUID), id_sp2d → data_sp2d, id_sumber_dana → master_sumber_dana
  nilai_bruto, nilai_neto

data_sp2d_potongan
  id(UUID), id_sp2d → data_sp2d
  tanggal_pencairan(NULLABLE!), jenis_potongan, nilai
  status_rekon (INDEPENDEN — tidak mengikuti SP2D induk)
  selisih_rekon, keterangan_rekon
  CATATAN: TIDAK ada kolom nomor_bukti di tabel ini

bank_statement
  tanggal, nomor_bukti, debet, kredit
  saldo_akhir (STALE — JANGAN DIPAKAI untuk kalkulasi)
  is_matched(bool), ref_bku_id, match_type, selisih_nilai

data_pendapatan
  tanggal, nomor_bukti(unique with tanggal), uraian, nilai
  status_rekon, keterangan_rekon, selisih_rekon

setoran_pajak  → NTPN tracking, proteksi double counting di BKU via NOT EXISTS
jurnal_talangan → status BELUM/SELESAI, id_sumber_asli + id_sumber_talangan
data_penyesuaian → jenis MASUK/KELUAR, sisi_pengaruh BUKU (default)
log_aktivitas → user_pelaksana, aksi, detail, created_at
```

**Aturan tipe data:**
- Money = `Decimal(20,2)` — casting konsisten wajib, mismatch = "selisih tidak akurat"
- Saldo Bank = WAJIB `SUM(kredit) - SUM(debet)` dinamis, JANGAN pakai `saldo_akhir`

---

## 5. ARSITEKTUR FRONTEND

```
Framework  : Next.js 16.2.4 + React 19 + TypeScript 5
Styling    : Tailwind CSS 4 + shadcn/ui (Radix UI primitives)
State      : React hooks + localStorage (user, token, theme)
Data Fetch : Axios (lib/api.ts) + SWR
Icons      : Lucide React 1.14.0
Animation  : Framer Motion 12.38.0
Charts     : Chart.js 4.5.1 + react-chartjs-2
Docs       : jsPDF + html2pdf + pdfjs-dist + Tesseract.js (OCR)
Toast      : Sonner 2.0.7
Forms      : React Hook Form 7.74.0
```

### lib/api.ts — Axios Instance
```
baseURL = NEXT_PUBLIC_API_URL || http://localhost:5000/api
Request interceptor  : tambah header "Authorization: Bearer {localStorage.token}"
Response interceptor : 401 → hapus token + user dari localStorage → redirect /login
WAJIB gunakan ini untuk semua backend call. Jangan buat Axios instance baru.
```

### Semua Route App (/app)
```
/login                       → halaman login
/dashboard                   → main hub (analytics)
/dashboard/sp2d              → arsip kas keluar (?tab=rekam | ?tab=arsip)
/dashboard/sp2d/kelengkapan  → [BARU] kelengkapan tanggal pencairan SP2D
/dashboard/rekon             → rekonsiliasi cerdas (Magic Match)
/dashboard/rekon/bank        → manajemen rekening koran
/dashboard/rekon/discrepancy → laporan selisih
/dashboard/rekon/anomalies   → integritas data
/dashboard/bku               → buku kas umum
/dashboard/jurnal            → buku besar / jurnal
/dashboard/pajak             → manajemen potongan (?tab=rekam | ?tab=arsip)
/dashboard/talangan          → jurnal talangan
/dashboard/penyesuaian       → penyesuaian & koreksi
/dashboard/ledgers/bank      → BP bank (rekening)
/dashboard/ledgers/pajak     → BP potongan (pajak/IWP)
/dashboard/ledgers/opd       → BP unit kerja (OPD)
/dashboard/master-data       → master data referensi
/dashboard/saldo-awal        → setup saldo awal
/dashboard/simulator         → simulator kas cerdas
/dashboard/logs              → log aktivitas
/dashboard/users             → manajemen akun
/dashboard/settings          → profil & pengaturan
/pendapatan                  → arsip kas masuk (?tab=rekam | ?tab=arsip)

GOLDEN REFERENCE: frontend/src/app/dashboard/sp2d/page.tsx
→ Template untuk semua halaman arsip baru
```

### Komponen Kustom (src/components/)
```
Sidebar.tsx       → navigasi 9 grup, collapsible, Framer Motion expand/collapse
Header.tsx        → user profile, theme toggle, AI assistant toggle
AIChatBubble.tsx  → Bro Jenius chat (persistent di semua halaman)
MainLayout.tsx    → layout wrapper (skip di /login)
NumericInput.tsx  → input angka dengan format Rupiah otomatis
PrintEngine.tsx   → PDF dengan kop surat pemerintah
PdfPreviewModal.tsx → preview dokumen PDF
DataTable.tsx     → tabel reusable sorting/filtering
ConfirmDialog.tsx → modal konfirmasi reusable
IdleTimer.tsx     → session timeout management
JoyfulLoader.tsx  → loading indicator
```

### shadcn/ui Components Tersedia
```
button, input, textarea, card, dialog, select, tabs, table,
badge, label, separator, tooltip, skeleton, sonner (toast), confirm-dialog
```

### Utilities
```
lib/utils.ts
  cn()                   → Tailwind class merging (clsx + tailwind-merge)
  formatCurrency()       → format Rupiah: Rp 1.234.567
  formatNumber()         → angka dengan locale ID
  parseNumber()          → parse string format ID/DB menjadi number
  formatCurrencyCompact() → "1.2M" / "86.4M"

lib/exportUtils.ts
  generatePDF()          → PDF dengan kop surat resmi + tanda tangan
  exportToExcel()        → single/multi-sheet Excel
  printDocument()        → print dengan format pemerintah

hooks/useAuth.ts
  { user, loading, logout } — state dari localStorage
```

---

## 6. STANDAR UI/UX (GOLD STANDARD)

### Warna & Komponen Inti
```
Warna Utama Header : #101828 (Dark Navy)
Icon Container     : rounded-xl w-12 h-12

Summary Cards (grid 4 kolom wajib):
  Card 1 Biru  : bg-[#EFF8FF] text-[#175CD3]  → total utama (Bruto/Pendapatan)
  Card 2 Merah : bg-[#FEF3F2] text-[#F04438]  → data kritikal (Talangan/Pengeluaran)
  Card 3 Cyan  : bg-[#F5F9FF] text-[#175CD3]  → aktivitas (jumlah transaksi)
  Card 4 Amber : bg-amber-50 text-amber-600    → audit/saldo/selisih
```

### Filter Bar & Tabel
```
Filter Bar  : Card bertitle "Panel Kontrol Arsip" (font-black text-xs uppercase)
              Search selalu terlihat | filter detail collapsible (AnimatePresence)
              Tombol: Cetak (Biru), Export (Hijau) → di kanan panel

Tabel Header: font-black text-[10px] uppercase tracking-widest text-[#475467]
Tabel BG    : bg-[#F8F9FA]/50
Row Hover   : hover:bg-[#F9FAFB]
Tab Nav     : shadcn Tabs, pola "Rekam" vs "Arsip"
```

---

## 7. ATURAN BISNIS REKONSILIASI (KRITIS — C.1–C.4)

> Lahir dari krisis Rp 64M/86M Mei 2026. Jangan modifikasi tanpa memahami ini sepenuhnya.

### C.1 — INDEPENDENSI POTONGAN
Rincian potongan SP2D bersifat **INDEPENDEN** — status rekonsiliasi TIDAK mengikuti SP2D induk. Potongan harus dicocokkan sendiri ke mutasi bank atau setoran pajak (NTPN). Ini mencegah "Ghost Match" (status SUDAH tapi tidak ada mutasi bank).

### C.2 — PRIORITAS NETO → BRUTO
- Matching selalu coba nilai neto dulu
- Fallback ke nilai bruto (`SUDAH_BRUTO`) untuk transfer RKUD tanpa rincian potongan
- **JANGAN ubah `nilai_neto` asli di DB** — hanya ubah `status_rekon`
- Display di rekonsiliasi: `CASE WHEN status_rekon = 'SUDAH_BRUTO' THEN nilai_bruto ELSE nilai_neto END`

### C.3 — GOLD STANDARD MATCHING (2 parameter saja, sejak 2026-05-16)
1. **Nilai Nominal** — exact match via `Math.round(nilai * 100)` cents
2. **Jarak Tanggal** — H-1 sampai H+7 dari `tanggal_pencairan`

`calculateSimilarityScore` **SUDAH DIHAPUS** — text matching rawan false positive karena format uraian BKU vs deskripsi bank sangat berbeda.

**STRICT**: jika deskripsi bank mengandung nomor dokumen (mis. `000025`) yang BERBEDA dari nomor BKU (`000026`) → **tolak** pencocokan meski nilai sama.

Threshold engine:
- `runMagicMatch`: score gap > 15 poin
- `bulkMatchSmart`: same-day + score gap > 50
- `getSuggestions`: rank by nilai exact dulu, lalu jarak tanggal

### C.4 — TANGGAL PENCAIRAN WAJIB DIISI
SP2D/potongan tanpa `tanggal_pencairan` → sistem fallback ke `tanggal` SIPD → jarak tanggal meleset → Ghost Match atau tidak ter-match.

**Solusi**: fitur `/dashboard/sp2d/kelengkapan`:
- Isi bulk `tanggal_pencairan` untuk SP2D yang null
- Cascade otomatis: update SP2D → semua potongan turunan NULL ikut terupdate
- Auto-rematch: setelah update, cari `bank_statement` unmatched dengan `ABS(debet - neto) < 1000` AND `tanggal ±7 hari` → link otomatis, set `status_rekon='SUDAH'`

### Logika Operasional Wajib
```
Saldo Bank      : WAJIB SUM(kredit) - SUM(debet). JANGAN pakai saldo_akhir (stale).
Double Counting : NOT EXISTS guard pada setoran_pajak di BKU UNION query.
Audit Trail     : keterangan_rekon = single source of truth untuk semua catatan audit.
Uraian Bersih   : kolom uraian TIDAK boleh mengandung tag teknis [Rekon], [BELUM], dll.
Anomali Alert   : selisih > Rp 100.000 → prefix [ANOMALI SELISIH] di keterangan_rekon.
Magic Match     : dukung filter rentang tanggal Harian/Mingguan/Bulanan.
Batalkan Rekon  : tombol undo per baris di tabel BKU.
Cross-Highlight : klik baris BKU → scroll + highlight pasangan di tabel Bank.
```

---

## 8. ATURAN MODIFIKASI KODE

### [CRITICAL_LOGIC] — reconciliationController.js & reportController.js
- **DILARANG** ubah formula perhitungan pengeluaran tanpa konfirmasi dampak ke saldo BKU
- **DILARANG** ubah basis `tanggal_pencairan` (akan merusak sinkronisasi Dashboard vs Laporan)
- Setiap fitur baru wajib verifikasi dengan `node cek_total_belum.js` atau `final_check.js`

### Jebakan Route Order
Route `/missing-pencairan/stats` dan `/missing-pencairan` harus didaftarkan **SEBELUM** `/:id` di `sp2dRoutes.js`. Jika setelah `/:id`, string `'missing-pencairan'` ditangkap sebagai parameter id → 404 atau error.

### Prisma $queryRaw
Gunakan `Prisma.sql` template literal untuk kondisi dinamis — JANGAN interpolasi string biasa (SQL injection risk).

### sessionStorage + useState
Gunakan lazy init `useState(() => sessionStorage.getItem('key'))` — JANGAN `useState(false)` + `useEffect` → menyebabkan lint error `set-state-in-effect`.

### Next.js 16 Breaking Changes
Sebelum modifikasi frontend Next.js, baca `frontend/node_modules/next/dist/docs/`. API dan konvensi berbeda dari versi lebih lama.

---

## 9. RIWAYAT UPDATE LENGKAP

### 2026-05-13: Fondasi Rekonsiliasi
- **Logic Bruto**: SP2D otomatis `SUDAH_BRUTO` jika bank bernilai Bruto, tanpa merusak arsip
- **Strict Matching**: kandidat Magic Match menolak perbedaan nomor dokumen meski nilai sama
- **Audit Massal**: 2.086 potongan + 77 SP2D false positive dibersihkan via skrip database
- **UX**: tombol "Batalkan Rekon" + label COCOK/TIDAK COCOK lebih kontras

### 2026-05-14 (Part 1): Integritas & Basis Penanggalan
- **Status Independen**: hapus cascading match, potongan wajib dicocokkan mandiri
- **Standarisasi tanggal_pencairan**: basis resmi pengeluaran di BKU dan Dashboard
- **NOT EXISTS guard**: mencegah double counting setoran_pajak
- **Saldo Bank Dinamis**: `SUM(kredit) - SUM(debet)` menggantikan kolom stale
- **Pembersihan**: >150 file scratch/backup/debug dihapus dari root backend

### 2026-05-14 (Part 2): Finalisasi Integritas
- **SUDAH_BRUTO**: dukungan penuh pemindahbukuan RKUD tanpa rincian potongan di SP2D
- **Resolusi selisih Rp 64M & Rp 86M**: via sinkronisasi tanggal pencairan + koreksi status
- **Tag [CRITICAL_LOGIC]**: ditambahkan ke backend controllers sebagai guard wajib konfirmasi

### 2026-05-16: Audit Mendalam — Penghapusan Text Matching
- **HAPUS `calculateSimilarityScore`** seluruhnya dari `reconciliationController.js`
- **Alasan**: format uraian BKU dan deskripsi bank sangat berbeda → text matching tidak deterministik dan rawan false positive
- **Pencocokan kini murni 2 parameter**: Nilai Nominal (exact cents) + Jarak Tanggal
- **Threshold disesuaikan di 3 engine**: runMagicMatch, bulkMatchSmart, getSuggestions

### 2026-05-18: Investigasi Data + Fitur Baru

**[Investigasi Rp 32.369.682.925 BELUM Rekon]**
- Audit: 0 duplikat SP2D. Nilai sama adalah KEBETULAN (gaji M/2 vs M/3, nomor berbeda)
- Penyebab BELUM: bank statement untuk tanggal-tanggal tersebut belum diimport
- Sisa BELUM per bulan: Feb Rp 344M | Mar Rp 3.76B | Apr Rp 28.24B

**[Perbaikan 10 Entri Bank BPJS Maret yang Tidak Ter-match]**
- Metode: ekstrak OPD keyword dari deskripsi bank (DPP&KB→PENGENDALIAN PENDUDUK, DISPAREKR→PARIWISATA, DISPORA→PEMUDA, BAPENDA→PENDAPATAN DAERAH)
- Fix 6 entri: OPD keyword + jenis_potongan match
- Fix 3 entri tambahan: OPD keyword saja (bank tulis "JKM", DB simpan "JKK")
- Sisa 1 tidak ter-match: SETORAN PEMINDAHBUKUAN id:20147 Rp 19.119,80 → perlu review manual
- Temuan: `data_sp2d_potongan` TIDAK memiliki kolom `nomor_bukti`

**[Fitur Baru: Kelengkapan Tanggal Pencairan SP2D]**

Backend — sp2dController.js + sp2dRoutes.js:
```
GET  /api/sp2d/missing-pencairan/stats  → { sp2dCount, sp2dNeto, potonganCount, byBulan[] }
GET  /api/sp2d/missing-pencairan        → list SP2D/potongan null pencairan + filter + pagination
PUT  /api/sp2d/missing-pencairan/bulk   → bulk update + cascade potongan + auto-rematch bank
```

Frontend baru/dimodifikasi:
```
/dashboard/sp2d/kelengkapan (BARU)
  → stat cards (SP2D + potongan null)
  → tabs SP2D | Potongan
  → filter tahun/bulan
  → tabel checkbox multi-select + inline date input per baris
  → floating bulk action bar dengan date picker + "Terapkan & Auto-Match ke Bank"

/dashboard/sp2d/page.tsx (MODIFIKASI)
  → SWR fetch /sp2d/missing-pencairan/stats
  → warning banner "X SP2D belum pencairan → Perbaiki Sekarang"
  → banner dismissable via sessionStorage

Sidebar.tsx (MODIFIKASI)
  → menu item "Kelengkapan Pencairan" + icon CalendarCheck di grup "Transaksi Kas Keluar"
```

**[Fix Copy Nomor SP2D]**
```
Sebelum : Copy icon opacity-0 (invisible sepenuhnya), klik seluruh div
Sesudah : <button> opacity-40 (selalu samar terlihat), hover → opacity-100
          title="Salin nomor SP2D", toast.success() feedback, select-all pada teks nomor
Lokasi  : sp2d/page.tsx ~baris 1107 (tabel arsip utama) & ~1675 (secondary view)
```

---

## 10. STATUS & TINDAKAN PENDING (per 2026-05-18)

**Perlu tindakan user:**
1. **IMPORT** bank statement Feb 27, 2026 → resolve Rp 344M BELUM
2. **IMPORT** bank statement Mar 31, 2026 → resolve Rp ~2.5B BELUM
3. **IMPORT** seluruh bank statement April 2026 → resolve Rp 28.2B BELUM
4. **REVIEW MANUAL**: bank id:20147 "SETORAN PEMINDAHBUKUAN" Rp 19.119,80
5. **RESTART backend** server agar endpoint `/missing-pencairan/*` aktif

**Script diagnostik tersedia di `backend/`:**
```
cek_total_belum.js    → ringkasan total BELUM per bulan
audit_sp2d_claim.js   → cek duplikat / coincidence nilai SP2D
audit_bpjs_match.js   → investigasi match BPJS potongan vs bank
fix_bpjs_potongan.js  → fix matching BPJS dengan OPD keyword + jenis
fix_bpjs_sisa.js      → fix matching BPJS tanpa filter jenis (untuk JKM→JKK mismatch)
```
