# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

DSS BPKAD — a Decision Support System for an Indonesian local-government finance agency (Badan Pengelola Keuangan dan Aset Daerah). Its core job is **reconciling the Buku Kas Umum (BKU)** — internal cash ledger built from SP2D disbursements, revenue (pendapatan), tax (pajak/potongan) — **against bank statements (rekening koran)**. Domain terms, UI text, and DB columns are in Indonesian; keep that convention when adding code.

The repo is a two-app monorepo (no root package.json, not a git repo):

- `backend/` — Express 5 API, Prisma 6 + PostgreSQL, JWT auth, OpenRouter/Gemini AI.
- `frontend/` — Next.js 16 + React 19 (App Router, TypeScript, Tailwind 4). **This is the live frontend.**
- `bpkad-dss-frontend/` — an empty default `create-next-app` scaffold. Ignore it unless explicitly asked.

`README.md` is outdated (claims Express+raw-pg+Next.js 15). `BLUEPRINT_DSS_BPKAD.md` is the more accurate architecture overview. Trust the code over both.

## Run / build

```powershell
# Backend (http://localhost:5000)
cd backend; npm install; node server.js     # or: npx nodemon server.js

# Frontend (http://localhost:3000)
cd frontend; npm install; npm run dev
cd frontend; npm run build                   # production build
cd frontend; npm run lint                    # eslint (only quality gate that exists)
```

`run_app.bat` at the repo root launches both. There is **no test suite** — the backend `npm test` is a placeholder that exits 1, and the frontend has lint only. Don't claim tests pass; verify behavior by running the app.

## Database — important nuances

- **Prisma is the only data layer used by controllers.** Every controller imports the shared singleton `backend/prismaClient.js`. `backend/config/db.js` (a raw `pg` Pool) exists but is **not used by any controller** — treat it as legacy; don't introduce raw-pg queries into request handlers.
- **There are no Prisma migrations** (`backend/prisma/migrations/` does not exist). The schema is owned by raw SQL in `backend/database/init.sql`; `backend/prisma/schema.prisma` is a *reflection* of that DB (UUID PKs via `dbgenerated("gen_random_uuid()")`, `@@map` to snake_case tables). Consequence: **editing `schema.prisma` alone does not change the database.** A schema change means updating `init.sql` (and applying it / `prisma db push`) and re-running `npx prisma generate`. ~18 models; key ones: `users`, `data_sp2d` + `detail_sp2d` + potongan, `data_pendapatan`, `bank_statement`, `setoran_pajak`, `master_sumber_dana`, `jurnal_talangan`, `master_pagu`, `data_penyesuaian`.
- Money is `Decimal(20,2)`. Reconciliation matches on value + a date window (H+7). Decimal type mismatches are the usual cause of "selisih tidak akurat" bugs — keep casting consistent.
- DB credentials, `JWT_SECRET`, and AI API keys are committed in `backend/.env` (also `password db.txt` at root). This is existing state; do not reproduce these secrets into new files or move them around without being asked.

## Backend request flow

`server.js` mounts seven route modules, all under `/api`:

| Mount | File | Notes |
|---|---|---|
| `/api/auth` | authRoutes | login/register, JWT issue |
| `/api/sp2d` | sp2dRoutes | SP2D CRUD, potongan, Excel import (multer) |
| `/api/pendapatan` | pendapatanRoutes | revenue |
| `/api/dss` | dssRoutes | dashboard, talangan, penyesuaian, saldo-awal, simulator, intelligence/AI, setoran-pajak |
| `/api/reports` | reportRoutes | **all reconciliation endpoints live here**, e.g. `/api/reports/reconciliation/match` (magic match), `/match-smart`, `/data`, `/anomalies` |
| `/api/admin` | adminRoutes | the only routes using `roleMiddleware` |
| `/api/bku` | bkuRoutes | Buku Kas Umum ledger |

A common surprise: reconciliation is under `/api/reports/reconciliation/*` (handled by `reconciliationController`), not `/api/dss`, even though `dssRoutes` also imports that controller.

Layering: `routes/` → `middleware/authMiddleware` (JWT bearer, sets `req.user`) → `controllers/` (business logic, Prisma) → `services/` (`aiService`, `auditService`, `dssService`) and `utils/` (`accountingEngine`, `dateUtils`). `roleMiddleware` is a `checkRole(allowedRoles)` factory, applied only in `adminRoutes`; every other route is auth-gated but not role-gated.

The repo root of `backend/` is littered with ~120 one-off scripts (`check*.js`, `debug*.js`, `analyze*.js`, `audit*.js`, `seed*.js`, `migrate_*.js`, plus `scratch/`). These are ad-hoc forensic/data-fix tools, **not** part of the running app — don't treat them as architecture and don't wire them into `server.js`.

## Frontend

- Two route trees under `frontend/src/app/`: a top-level set (`/login`, `/sp2d`, `/pendapatan`, …) and the main authenticated app under `/dashboard/*` (rekon, ledgers, sp2d, talangan, simulator, users, …). When adding a feature, check whether a `/dashboard/*` equivalent already exists before adding to the top-level tree.
- API access goes through `frontend/src/lib/api.ts`: a single Axios instance, base URL `NEXT_PUBLIC_API_URL` (default `http://localhost:5000/api`). Request interceptor attaches `Bearer ${localStorage.token}`; a 401 response clears `token`/`user` and redirects to `/`. Use this client for all backend calls; don't hand-roll fetch with manual auth headers.
- Data fetching: SWR. UI: shadcn/Radix + Tailwind 4 + Framer Motion. Charts: Chart.js. Client-side document work: pdfjs-dist, tesseract.js (OCR), xlsx, jspdf, puppeteer/html2pdf for export.

### Next.js 16 is not the version you know

`frontend/AGENTS.md` (also referenced by `frontend/CLAUDE.md`) warns: this Next.js has breaking changes vs. training data — APIs, conventions, and file structure may differ. **Before writing or modifying frontend Next.js code, read the relevant guide in `frontend/node_modules/next/dist/docs/`** and heed deprecation notices rather than relying on remembered Next.js patterns.

## Locked Business Rules — JANGAN DIUBAH

Bagian ini mendokumentasikan aturan bisnis yang sudah dikonfirmasi dan dikunci oleh pengguna. AI agent TIDAK BOLEH mengubah logika ini tanpa konfirmasi eksplisit dari pengguna terlebih dahulu.

### Taspen Merge ke IWP 8% saat Upload SIPD

**Masalah:** Aplikasi SIPD-RI mengeluarkan baris "Taspen" sebagai entri terpisah dari "Iuran Wajib Pegawai 8%". Namun di rekening koran bank, kedua potongan ini dibayarkan **sekaligus dalam satu debit**. Jika dibiarkan terpisah, nilai IWP 8% tidak akan cocok dengan mutasi bank.

**Solusi yang WAJIB dipertahankan** (dikunci Juni 2026):
- Fungsi `importExcelPajak` di `backend/controllers/sp2dController.js` melakukan **pre-scan** sebelum loop utama untuk membangun `taspenMergeMap`.
- Saat loop utama: baris "Taspen" di-**skip** (tidak disimpan sebagai record terpisah).
- Baris "Iuran Wajib Pegawai 8%" ditambahkan dengan nilai Taspen dari pre-scan → disimpan sebagai **satu record gabungan**.
- Kolom `keterangan` mencatat `"Termasuk Taspen: [nilai]"` sebagai audit trail.

**Aturan yang WAJIB dipertahankan:**
- Baris dengan `taxName.toUpperCase().includes('TASPEN')` (di `importExcelPajak`) atau `(rincian.URAIAN || '').toUpperCase().includes('TASPEN')` (di `importPotonganManual`) HARUS di-skip — tidak boleh disimpan ke DB.
- `taspenMergeMap` HARUS diisi sebelum transaksi dimulai (pre-scan sebelum `prisma.$transaction`) di **kedua fungsi**.
- Merge HANYA terjadi jika `jenis === 'IWP 8%'` — jangan perluas ke jenis potongan lain.
- Kolom `keterangan` mencatat `"Termasuk Taspen: [nilai]"` sebagai audit trail di kedua fungsi.

**Lokasi kode (KEDUA fungsi harus dijaga):**
- `backend/controllers/sp2dController.js`, fungsi `importExcelPajak` — blok komentar `PRE-SCAN` dan `MERGE TASPEN → IWP 8%` (untuk tombol "Impor SIPD").
- `backend/controllers/sp2dController.js`, fungsi `importPotonganManual` — blok komentar `PRE-SCAN TASPEN` dan `SKIP TASPEN` dan `MERGE TASPEN → IWP 8%` (untuk tombol "Impor Rincian"). **Ditambahkan Juni 2026** karena fungsi ini awalnya tidak memiliki logika merge.

---

### Potongan Mengendap

**Definisi:** Potongan SP2D yang tidak memiliki pos pembayaran di rekening koran bank.

**Kriteria:** `uraian` atau `keterangan` mengandung kata **'lainnya'** (case-insensitive) — tidak ada kondisi tambahan lain.

**Aturan yang WAJIB dipertahankan:**
- Hanya potongan `'Lainnya'` yang masuk kategori potongan mengendap. Potongan PPN, PPh, BPJS, Taspen, dan jenis lain TIDAK termasuk — mereka harus punya padanan di bank.
- **SEMUA** potongan 'Lainnya' **TIDAK BOLEH muncul di halaman anomalies** (`/dashboard/rekon/anomalies`) — tanpa syarat status, selisih, atau parent SP2D.
- Potongan 'Lainnya' **HANYA tampil di halaman** `/dashboard/rekon/potongan-mengendap`.
- Filter di `getAnomalies` adalah satu baris: `AND NOT (LOWER(p.uraian) LIKE '%lainnya%' OR LOWER(p.keterangan) LIKE '%lainnya%')` — TIDAK BOLEH diperluas ke jenis potongan lain.

**Lokasi kode yang dilindungi** (`backend/controllers/reconciliationController.js`):
- Fungsi `getPotonganMengendap` — blok komentar `BUSINESS RULE LOCK` di atas fungsi
- Fungsi `getAnomalies` — dua baris `AND NOT (...)` bertanda `BUSINESS RULE LOCK` di query `unmatchedPotongan` dan `countPotongan`

**Dikunci:** Juni 2026 (diperbarui Juni 2026 — disederhanakan dari 4 kondisi ke filter uraian saja).

---

### Potongan Gelondongan LS Kontraktual / LS Barjas

**Skenario:** SP2D jenis LS Kontraktual dan LS Barjas dicairkan NETTO ke vendor. Pajak yang dipotong (PPN + PPh 4(2) / PPh 22) dibayarkan ke Kas Negara oleh bank dalam **satu debit gelondongan** — 1 mutasi bank = total semua rincian potongan dari SP2D yang sama.

**Komponen match yang dihasilkan:**
- SP2D header → matched ke vendor payment (NETO) via SMART_AUTO atau MANUAL
- Bank debit gelondongan → matched ke grup rincian potongan via `GRUP_POTONGAN`

**Aturan yang WAJIB dipertahankan:**

#### 1. Handler GRUP_POTONGAN WAJIB sebelum lookup SP2D (`matchIndividual`)

`bkuId` yang dikirim frontend = **UUID SP2D** (bukan UUID potongan). Jika lookup `data_sp2d` dilakukan lebih dulu:
- SP2D ditemukan → `bkuRowData` terisi → kondisi `!bkuRowData` menjadi FALSE
- Handler GRUP_POTONGAN di-skip → match jatuh ke NETO SP2D match (salah)
- Potongan PPN+PPh tetap BELUM selamanya

**Posisi kode yang dilindungi:** `backend/controllers/reconciliationController.js`, fungsi `matchIndividual` — blok `if (match_type === 'GRUP_POTONGAN')` HARUS berada sebelum `const sp2d = await prisma.data_sp2d.findUnique(...)`.

#### 2. `bank_statement.ref_bku_id` untuk GROUP_POTONGAN = UUID SP2D

Ini desain yang benar, bukan bug. Section 4 `getAnomalies` mendeteksi ghost match via:
```sql
bx.ref_bku_id = p.id_sp2d::text AND bx.match_type = 'GROUP_POTONGAN'
```
Tergantung pada `ref_bku_id = id_sp2d`. Jangan ubah ke id potongan.

#### 3. `getAnomalies` Section 3 — TIDAK BOLEH JOIN `bank_statement`

Query potongan BELUM di Section 3 tidak boleh memakai `LEFT JOIN bank_statement`. Alasan: JOIN dengan kondisi OR (`ref_bku_id = p.id OR ref_bku_id = p.id_sp2d`) menyebabkan Nested Loop 6,3 juta perbandingan → 3.500 ms per query (dari ~1.033 iterasi potongan × 6.110 bank rows). Ghost match (SUDAH tanpa bank link) ditangani **terpisah** oleh Section 4. Hasil setelah fix: 110 ms (32× lebih cepat).

**Lokasi:** `backend/controllers/reconciliationController.js`, fungsi `getAnomalies` — komentar `BUSINESS RULE LOCK — TIDAK BOLEH JOIN bank_statement DI SINI` di Section 3.

#### 4. `getDiscrepancyReport` Q7 — hanya potongan 'Lainnya'

Query `potonganUnmatched` (Q7) yang mensuplai data koreksi saldo BKU di halaman Ringkasan WAJIB memfilter hanya potongan `'lainnya'`. Potongan non-lainnya (PPN/PPh/BPJS/dll) yang BELUM akan meng-inflate saldo BKU secara salah → selisih palsu di Point B. Wajib menggunakan `COALESCE(p.tanggal_pencairan, s.tanggal_pencairan, s.tanggal)` untuk konsistensi tanggal.

**Lokasi:** `backend/controllers/reconciliationController.js`, fungsi `getDiscrepancyReport` — komentar `BUSINESS RULE LOCK — Q7 potonganUnmatched`.

#### 5. Stale `selisih_rekon` pasca GROUP_POTONGAN fix

Jika gelondongan bank debit pernah salah di-NETO-match ke SP2D sebelum GROUP_POTONGAN fix, SP2D akan menyimpan `selisih_rekon` stale. Fix DB fix pada bank dan potongan **tidak** otomatis mereset `selisih_rekon` pada SP2D. Pattern yang perlu diperiksa:
- SP2D status SUDAH dengan `selisih_rekon` besar negatif
- Punya bank debit `match_type = GROUP_POTONGAN` ter-link
- Tapi juga punya bank debit SMART_AUTO = nilai neto (correct match sudah ada)

Dalam kondisi ini, `selisih_rekon` SP2D harus di-reset ke 0 secara manual via DB update.

**Dikunci:** Juni 2026.

---

---

### Berita Acara Rekonsiliasi (BAR) — `dashboard/rekon/discrepancy`

**Dikunci:** Juni 2026. Semua aturan berikut JANGAN DIUBAH tanpa perintah eksplisit.

#### 1. Persistensi data Mengetahui (BPKAD)

`app_config` override untuk `pejabat3` / `jabatan3` / `nip3` di load useEffect (`page.tsx`) WAJIB dibungkus `if (!savedBar)`. Tanpa guard ini, data Mengetahui yang sudah disimpan user akan tertimpa setiap kali halaman dimuat (termasuk saat ganti bulan cetak).

**Lokasi:** `frontend/src/app/dashboard/rekon/discrepancy/page.tsx` — blok komentar `LOCKED: app_config override ... HANYA jika !savedBar`.

#### 2. Alignment tanda tangan Pihak Kesatu vs Pihak Kedua

`sig-col` pada PDF (`route.ts`) WAJIB menggunakan `display: flex; flex-direction: column` dan `sig-space` WAJIB `flex: 1; min-height: 45px`. Ini memastikan nama kedua kolom selalu sejajar di baris yang sama meskipun jabatan Pihak Kedua lebih panjang (multi-baris). `align-items: stretch` pada `signature-row` wajib dipertahankan.

Preview (`page.tsx`) menggunakan `items-stretch` + `flex flex-col` + `flex-1 min-h-[4rem]` dengan logika yang sama.

**Lokasi:** `frontend/src/app/api/cetak-discrepancy-rekon/route.ts` — komentar `LOCKED: sig-col flex-direction:column`.

#### 3. Invisible pangkat placeholder Pihak Kedua

Ketika `barConfig.showPangkat && barConfig.pangkat1` aktif, kolom Pihak Kedua WAJIB memiliki placeholder invisible setinggi satu baris pangkat. Tanpa ini, nama Pihak Kedua akan lebih tinggi dari nama Pihak Pertama.

**Lokasi:** `page.tsx` baris `<p className="leading-tight invisible">_</p>` dan `route.ts` baris `visibility: hidden`.

#### 4. Kalimat "Selanjutnya disebut sebagai PIHAK KESATU/KEDUA"

Setelah NIP/ID masing-masing pihak di paragraf pembuka, WAJIB ada kalimat italic: *"Selanjutnya disebut sebagai **PIHAK KESATU**"* dan *"Selanjutnya disebut sebagai **PIHAK KEDUA**"*. Berlaku di PDF (`route.ts`) dan preview (`page.tsx`).

#### 5. Kalimat kesimpulan (Section D)

Redaksi baku yang dikunci: `"...antara Buku Kas Umum (BKU) dengan Rekening Koran RKUD pada PT. Bank Maluku-Maluku Utara Cabang Dobo."` — JANGAN kembalikan ke `barConfig.jabatan2`.

**Lokasi:** `route.ts` dan `page.tsx` — komentar `LOCKED: Redaksi kalimat kesimpulan`.

#### 6. Kalimat "Telah melakukan rekonsiliasi" — penyebutan pihak

Kalimat harus menyebut **Pihak Kesatu** dan **Pihak Kedua** secara eksplisit: `"...antara Pihak Kesatu Kuasa Bendahara Umum Daerah (KBUD) Kabupaten Kepulauan Aru dengan Pihak Kedua PT. Bank Maluku-Maluku Utara Cabang Dobo..."`.

---

## AI integration

`backend/services/aiService.js` powers the intelligence/chat features. Primary provider is **OpenRouter** (`deepseek/deepseek-chat`) via `OPENROUTER_API_KEY`; Google Gemini (`@google/generative-ai`, `GEMINI_API_KEY`) is the fallback. Exposed through `intelligenceController` at `/api/dss/intelligence/*`.
