# MIGRATION LOG — DSS BPKAD Design System

Mencatat setiap file yang dimigrasi ke design system baru.  
Aturan: setiap entri dibuat setelah migrasi selesai dan user melakukan test manual.

---

## Modul Penerimaan (Pendapatan)

### Status: ✅ Selesai — Menunggu Test Manual

**File:** `frontend/src/app/pendapatan/page.tsx`  
**Tanggal:** 2026-05-18  
**Ukuran:** 1525 baris → 1021 baris (−33%)

---

### Komponen yang Diganti

| Lama | Baru | Lokasi |
|---|---|---|
| Custom `<div>` header + manual layout | `<PageHeader>` dari `patterns/` | Baris ~85 JSX |
| Native `<input type="date/text">` | `<Input>` + `<FormField>` | Form rekam transaksi |
| Native `<select>` untuk Sumber Dana | `<Select>` (shadcn) + `<FormField>` | Form rekam transaksi |
| `<textarea>` native | `<Textarea>` + `<FormField>` | Form rekam transaksi |
| `<button type="submit">` custom (hardcoded `bg-fin-text-primary`) | `<Button variant="primary" size="lg" loading={...}>` | Submit form |
| `<button>` cancel custom | `<Button variant="ghost">` | Cancel form |
| Custom filter card dengan `<Input>` + search icon manual | `<FilterBar>` + `<SearchInput>` | Filter bar arsip |
| Filter panel label-input manual | `<FormField>` | Advanced filter panel |
| `<select>` native untuk filter Sumber Dana | `<Select>` (sudah shadcn, dipertahankan) | Advanced filter |
| `<button>` inline untuk aksi tabel (Edit, Hapus, Clone) | `<Button variant="ghost" size="icon-sm">` | Kolom aksi tabel |
| `<button>` untuk Preview Bukti | `<Button variant="ghost" size="icon-sm">` | Kolom bukti tabel |
| AnimatePresence + motion.div custom untuk PDF Preview | `<Dialog size="xl">` | PDF preview modal |
| Dialog Rekonsiliasi dengan dark header (`bg-[#101828]`) | Dialog standar + `<DialogHeader>` + `<DialogBody>` | Rekon modal |
| `<Button>` Refresh Saldo dengan className hardcode | `<Button variant="primary" size="lg" loading={...}>` | Cash Monitor drawer |

---

### Warna & Token yang Diubah

| Lama | Baru | Contoh Lokasi |
|---|---|---|
| `bg-indigo-600` / `hover:bg-indigo-700` | `bg-ds-primary` / `bg-ds-accent` | Form submit button, form icon |
| `text-indigo-600` | `text-ds-accent` | Nilai nominal form |
| `focus:ring-indigo-600/5 focus:border-indigo-600` | Dihapus (ditangani oleh `<Input>` dan `<NumericInput>`) | Semua field form |
| `rounded-[32px]` / `rounded-[24px]` | `rounded-2xl` | Form card container |
| `text-[10px]` | `text-micro` | Label, badge, header tabel |
| `text-[11px]` | `text-mini` | Subtitle, helper text |
| `bg-[#F8F9FA]` / `bg-[#F9FAFB]` | `bg-fin-page` | Header tabel, filter panel |
| `bg-[#F2F4F7]` | `bg-fin-subtle` | Selected row, hover state |
| `border-[#EAECF0]` / `border-[#D0D5DD]` / `border-[#E9ECEF]` | `border-fin-border` | Semua border |
| `divide-[#E9ECEF]` | `divide-fin-border/50` | TableBody divider |
| `text-[#2E90FA]` | `text-fin-info` | Ikon checkbox aktif |
| `text-[#175CD3]` | `text-fin-info-text` | Ikon header card |
| `text-[#027A48]` | `text-fin-income-text` | Export button icon |
| `text-[#B42318]` | `text-fin-expense-text` | Talangan warning |
| `text-[#D0D5DD]` | `text-fin-border` | Checkbox belum dipilih |
| `hover:text-indigo-600 hover:border-indigo-600` | `hover:text-ds-accent` | Tombol Edit/Clone tabel |
| `group-focus-within/field:text-indigo-600` | Dihapus (pakai `<FormField>`) | Semua label form |
| `px-10 py-4` (table header) | `px-4 py-3` | Header kolom tabel |

---

### Logic yang TIDAK Diubah (Dipreserve 100%)

- ✅ Semua `useState` dan state management
- ✅ Semua API calls (`api.get`, `api.post`, `api.put`, `api.delete`, `api.patch`)
- ✅ `useSWR` dengan server-side pagination (currentPage, limit, filters)
- ✅ `handleSubmit`, `handleDelete`, `handleDeleteBulk`, `handleEdit`, `handleClone`
- ✅ `handleExportExcel`, `handleExportPDF`, `handlePrintPDF`, `handlePreviewReport`
- ✅ `handleImport` (bulk import Excel dengan XLSX parser)
- ✅ `handleSaveRekon` (update rekonsiliasi)
- ✅ `fetchCashStats`, `fetchSumberDana`
- ✅ `handleQuickFilter` (bulan ini, bulan lalu, besar, reset)
- ✅ `getFileUrl` helper
- ✅ `ConfirmDialog` state dan semua confirm flows
- ✅ Tab switching (rekam/arsip) + sync dengan query param
- ✅ Bulk selection logic (checkbox all, per-row)
- ✅ AnimatePresence tab transition, filter panel collapse, floating bulk bar
- ✅ Cash Monitor drawer (side panel kanan)
- ✅ `selectedFile` state untuk upload lampiran
- ✅ Pagination server-side (currentPage, totalPages, setLimit untuk "Tampilkan Semua")

---

### Hal yang PERLU Ditest Manual

**Form Rekam Transaksi:**
- [ ] Input tanggal terisi dan terformat benar
- [ ] Dropdown Sumber Dana tampil dan bisa dipilih (sekarang shadcn Select, bukan native)
- [ ] Nilai nominal tampil besar dengan format angka (NumericInput tetap dipakai)
- [ ] Upload file lampiran berfungsi (drag-drop + click)
- [ ] Tombol "Simpan" loading state + spinner muncul
- [ ] Mode Edit: badge "Mode Edit Aktif" muncul, tombol berubah jadi "Perbarui"
- [ ] Tombol "Batalkan" kembali ke tab arsip

**Tab Arsip / Tabel:**
- [ ] Data tabel muncul dengan benar
- [ ] Header tabel warna `bg-fin-page` (bukan abu-abu lama)
- [ ] Checkbox select-all dan per-row berfungsi
- [ ] Tombol Edit (ikon pensil) → pindah ke tab rekam dengan data terisi
- [ ] Tombol Clone → form terisi + nomor bukti ditambah "_COPY"
- [ ] Tombol Hapus → ConfirmDialog muncul
- [ ] Badge status rekon (BELUM/SUDAH/ANOMALI) tampil
- [ ] Tombol "CEK" / "FIX DIFF" → membuka Rekon Modal
- [ ] Tombol Preview Bukti (ikon FileSearch) → membuka PDF Preview

**Filter Bar:**
- [ ] SearchInput: mengetik → filter berjalan (debounce 300ms)
- [ ] Tombol "Filter" → toggle panel filter lanjutan
- [ ] Panel filter: Sumber Dana, tanggal awal-akhir berfungsi
- [ ] Tombol "Bulan Ini" mengisi tanggal otomatis
- [ ] Tombol Reset (RefreshCw) → semua filter bersih
- [ ] Tombol Reset di FilterBar muncul saat ada filter aktif

**Export/Import:**
- [ ] Tombol "Template" → download file Excel template
- [ ] Tombol "Import" → file picker terbuka, import berjalan
- [ ] Tombol "Cetak" → print dialog terbuka
- [ ] Tombol "Export" → file Excel terdownload

**Modal:**
- [ ] Rekon Modal: form status, selisih, catatan; tombol Simpan loading
- [ ] PDF Preview Modal: iframe tampil, tombol "Buka di Tab Baru" berfungsi
- [ ] Semua modal: bisa ditutup dengan X / Batal

**Monitor Kas (Drawer):**
- [ ] Tombol "Monitor Kas" → drawer slide dari kanan
- [ ] Cards saldo per sumber dana tampil
- [ ] Tombol "Refresh Saldo" loading state

**Bulk Action Bar:**
- [ ] Pilih 1+ baris → floating bar muncul dari bawah
- [ ] Tombol "Hapus Permanen" → ConfirmDialog muncul → bulk delete

**Dark Mode:**
- [ ] Semua warna token (`fin-*`, `ds-*`) menyesuaikan dark mode

---

## Modul Berikutnya (Antrian Setelah Konfirmasi)

> Catatan: User meminta migrasi semua modul secara bertahap, satu per satu setelah test.

| # | Modul | File | Status |
|---|---|---|---|
| 1 | Penerimaan (Pendapatan) | `app/pendapatan/page.tsx` | ✅ Selesai |
| 2 | Pengeluaran (SP2D) | `app/sp2d/page.tsx` + `dashboard/sp2d/page.tsx` | ⏳ Antrian |
| 3 | Pengambilan Keputusan | `dashboard/page.tsx` | ⏳ Antrian |
| 4 | BKU | `app/bku/page.tsx` + `dashboard/bku/page.tsx` | ⏳ Antrian |
| 5 | Rekonsiliasi Bank | `dashboard/rekon/bank/page.tsx` | ⏳ Antrian |
| 6 | Rekonsiliasi Discrepancy | `dashboard/rekon/discrepancy/page.tsx` | ⏳ Antrian |
| 7 | Rekonsiliasi Anomalies | `dashboard/rekon/anomalies/page.tsx` | ⏳ Antrian |
| 8 | Talangan | `app/talangan/page.tsx` + `dashboard/talangan/page.tsx` | ⏳ Antrian |
| 9 | Jurnal | `dashboard/jurnal/page.tsx` | ⏳ Antrian |
| 10 | Ledgers (Bank/Pajak/OPD) | `dashboard/ledgers/*/page.tsx` | ⏳ Antrian |
| 11 | Simulator | `dashboard/simulator/page.tsx` | ⏳ Antrian |
| 12 | Penyesuaian | `app/penyesuaian/page.tsx` + `dashboard/penyesuaian/page.tsx` | ⏳ Antrian |
| 13 | Master Data | `dashboard/master-data/page.tsx` | ⏳ Antrian |
| 14 | Users | `dashboard/users/page.tsx` | ⏳ Antrian |
| 15 | Setoran Pajak | `app/setoran-pajak/page.tsx` | ⏳ Antrian |
| 16 | Pajak | `dashboard/pajak/page.tsx` | ⏳ Antrian |
| 17 | SP2D Kelengkapan | `dashboard/sp2d/kelengkapan/page.tsx` | ⏳ Antrian |
| 18 | Login | `app/login/page.tsx` | ⏳ Antrian |
