# UI_AUDIT.md — Laporan Audit UI/UX DSS BPKAD
> Dibuat: 2026-05-18 | Read-only — tidak mengubah kode apapun
> Scope: 20 halaman + 5 komponen utama di `frontend/src/`

---

## RINGKASAN EKSEKUTIF

| Aspek | Status | Keterangan |
|-------|--------|------------|
| Design Tokens | ✅ Ada | 37 CSS variables di `globals.css` baris 7–98 |
| Konsistensi Pemakaian Token | ❌ Buruk | ~803 hardcoded hex yang seharusnya pakai token |
| Primary Button Color | ❌ Kacau | 3 warna berbeda untuk fungsi yang sama |
| Komponen Tabel | ⚠️ Mayoritas OK | 3 halaman masih pakai native `<table>` |
| Komponen Select/Dropdown | ⚠️ Split | Mix native `<select>` dan shadcn `<Select>` |
| Modal Sizing | ❌ Tidak Konsisten | 10 ukuran berbeda tanpa standar |
| Library UI | ✅ Jelas | shadcn/ui sebagai tulang punggung, tanpa duplikasi library |
| Font Size | ⚠️ Banyak Arbitrary | `text-[10px]` 89x, `text-[11px]` 34x — perlu custom utility |

**5 Masalah Kritis yang Perlu Diprioritaskan:**
1. Primary button color chaos: `bg-[#101828]` vs `bg-indigo-600` vs `bg-fin-text-primary`
2. 803 hardcoded hex (`bg-[#xxx]`, `text-[#xxx]`) padahal token sudah tersedia
3. `bg-indigo-600` digunakan ~25x tapi tidak ada di design tokens sama sekali
4. Mix native `<select>` dan shadcn `<Select>` dalam satu aplikasi
5. Modal sizing: 10 variasi berbeda tanpa standar

---

## BAGIAN 1 — LIBRARY UI YANG TERPASANG

### 1.1 Library Terpasang dan Pemakaian

| Library | Versi | Jumlah File | Pemakaian | Catatan |
|---------|-------|-------------|-----------|---------|
| **shadcn/ui** | v4.6.0 | 18 komponen | Sangat luas | Tulang punggung UI |
| **Radix UI** | 7 paket | 56 file | Melalui shadcn wrapper | Tidak diimport langsung |
| **Base UI React** | v1.4.1 | — | Wrapper `button.tsx`, `input.tsx` | Dipakai dalam shadcn |
| **Framer Motion** | v12.38.0 | 50 file | 499 imports | Animasi sidebar, modal, tabel rows |
| **Lucide React** | v1.14.0 | 58 file | 2014 imports | Seluruh iconografi |
| **Tailwind CSS** | v4 | Semua | Seluruh styling | Tidak ada `style={}` inline |
| **React Hook Form** | v7.74.0 | ~5 file | Jarang | Mayoritas form pakai controlled state biasa |
| **Sonner** | v2.0.7 | Semua | Toast notifikasi | Konsisten di seluruh app |
| **tw-animate-css** | v1.4.0 | Semua | CSS animation utilities | Khusus Tailwind v4 |
| **MUI / Chakra / Ant** | — | — | ❌ Tidak dipakai | — |

### 1.2 Komponen shadcn yang Tersedia
File: `src/components/ui/`

| Komponen | File | Dipakai Di |
|----------|------|------------|
| Button | `button.tsx` | Semua halaman |
| Input | `input.tsx` | Semua halaman dengan form |
| Card | `card.tsx` | Dashboard, kelengkapan, bku |
| Badge | `badge.tsx` | Semua halaman (status indicators) |
| Table | `table.tsx` | 17 dari 20 halaman |
| Dialog | `dialog.tsx` | 12 halaman |
| Select | `select.tsx` | 8 halaman |
| Tabs | `tabs.tsx` | sp2d, pajak, rekon, kelengkapan |
| Tooltip | `tooltip.tsx` | dashboard, bku, rekon |
| Separator | `separator.tsx` | Header, beberapa halaman |
| Label | `label.tsx` | Form-heavy pages |
| Textarea | `textarea.tsx` | discrepancy, penyesuaian |
| Skeleton | `skeleton.tsx` | jurnal, talangan, rekon |
| Sonner | `sonner.tsx` | Layout root |
| ConfirmDialog | `confirm-dialog.tsx` | 19 halaman (delete, settle, logout) |
| **DataTable** | `DataTable.tsx` | ⚠️ **Tidak diimport di mana pun — orphaned** |
| PrintEngine | `PrintEngine.tsx` | 19 file |
| PdfPreviewModal | `PdfPreviewModal.tsx` | 3 file (sp2d, pendapatan, pajak) |

---

## BAGIAN 2 — INVENTARISASI TOMBOL

### 2.1 Definisi Variant di button.tsx
**File**: [src/components/ui/button.tsx](src/components/ui/button.tsx) baris 6–33

```
Variants tersedia (CVA):
  default     → bg-indigo-600, text-white, hover:bg-indigo-700
  outline     → border-fin-border, bg-fin-surface, text-fin-text-primary
  secondary   → bg-fin-subtle, text-fin-text-primary
  ghost       → hover:bg-fin-subtle, text-fin-text-muted
  destructive → bg-fin-expense-bg, text-fin-expense-text
  link        → text-indigo-600, underline
  income      → bg-fin-income, text-white

Sizes tersedia:
  default   → h-8, px-3, gap-1.5
  xs        → h-6, px-2, text-xs
  sm        → h-7, px-2.5
  lg        → h-9, px-4, gap-2
  icon      → size-8
  icon-sm   → size-7
```

### 2.2 MASALAH KRITIS — Primary Button Color Chaos

Tombol "aksi utama" (simpan, konfirmasi, submit) menggunakan **3 pendekatan berbeda** yang nilainya berbeda-beda:

| Pendekatan | Warna | File | Baris |
|------------|-------|------|-------|
| Hardcoded navy | `bg-[#101828] hover:bg-[#1D2939]` | [master-data/page.tsx](src/app/dashboard/master-data/page.tsx) | 197, 281 |
| Hardcoded navy | `bg-[#101828] hover:bg-[#1D2939]` | [users/page.tsx](src/app/dashboard/users/page.tsx) | 175, 222, 431 |
| Hardcoded navy | `bg-[#101828]` | [talangan/page.tsx](src/app/dashboard/talangan/page.tsx) | 388 |
| Hardcoded navy | `bg-[#101828]` | [penyesuaian/page.tsx](src/app/dashboard/penyesuaian/page.tsx) | 129 |
| Hardcoded navy | `bg-[#101828]` | [simulator/page.tsx](src/app/dashboard/simulator/page.tsx) | 408, 631 |
| Hardcoded navy | `bg-[#101828]` | [rekon/anomalies/page.tsx](src/app/dashboard/rekon/anomalies/page.tsx) | 204 |
| Indigo (bukan token) | `bg-indigo-600 hover:bg-indigo-700` | [login/page.tsx](src/app/login/page.tsx) | 321 |
| Indigo (bukan token) | `bg-indigo-600 hover:bg-indigo-700` | [talangan/page.tsx](src/app/dashboard/talangan/page.tsx) | 839, 1000 |
| Indigo (bukan token) | `bg-indigo-600 hover:bg-indigo-700` | [rekon/discrepancy/page.tsx](src/app/dashboard/rekon/discrepancy/page.tsx) | 369 |
| Indigo (bukan token) | `bg-indigo-600 hover:bg-indigo-700` | [sp2d/kelengkapan/page.tsx](src/app/dashboard/sp2d/kelengkapan/page.tsx) | 368, 462, 492 |
| Semantic token | `bg-fin-text-primary` | [pendapatan/page.tsx](src/app/pendapatan/page.tsx) | 793, 1428, 1514 |
| Semantic token | `bg-fin-text-primary` | [jurnal/page.tsx](src/app/dashboard/jurnal/page.tsx) | 131 |
| Semantic token | `bg-fin-text-primary` | [ledgers/bank/page.tsx](src/app/dashboard/ledgers/bank/page.tsx) | 175 |
| Semantic token | `bg-fin-text-primary` | [ledgers/pajak/page.tsx](src/app/dashboard/ledgers/pajak/page.tsx) | 119 |
| Semantic token | `bg-fin-text-primary` | [ledgers/opd/page.tsx](src/app/dashboard/ledgers/opd/page.tsx) | 136, 167 |

> **Catatan**: `bg-[#101828]` = `bg-fin-text-primary` secara nilai hex. `bg-indigo-600` (#4F46E5) adalah warna **berbeda** dari design token manapun dan tidak terdefinisi di `globals.css`.

### 2.3 Inkonsistensi Height Tombol dalam Satu Halaman

| Page | Heights ditemukan | Jumlah Variasi |
|------|------------------|----------------|
| [pendapatan/page.tsx](src/app/pendapatan/page.tsx) | h-7, h-8, h-9, h-10, h-11, h-12, **h-16** (baris 793) | **7 variasi** |
| [talangan/page.tsx](src/app/dashboard/talangan/page.tsx) | h-7, h-8, h-10, h-11 | 4 variasi |
| [simulator/page.tsx](src/app/dashboard/simulator/page.tsx) | h-8, h-9, h-10, h-12 | 4 variasi |
| [rekon/bank/page.tsx](src/app/dashboard/rekon/bank/page.tsx) | h-8, h-11, h-12, **h-14** (baris 623) | 4 variasi |
| [bku/page.tsx](src/app/dashboard/bku/page.tsx) | h-8, h-9, h-10 | 3 variasi |

### 2.4 Border-Radius Tombol Tidak Konsisten

| Radius | Occurrences | Contoh File |
|--------|-------------|-------------|
| `rounded-lg` | 112+ | Mayoritas halaman — default |
| `rounded-xl` | 98+ | [jurnal/page.tsx](src/app/dashboard/jurnal/page.tsx), [talangan/page.tsx](src/app/dashboard/talangan/page.tsx), [users/page.tsx](src/app/dashboard/users/page.tsx) |
| `rounded-2xl` | 10+ | [rekon/bank/page.tsx](src/app/dashboard/rekon/bank/page.tsx) baris 623, 631 (modal buttons) |
| `rounded-[24px]` | 3 | [pendapatan/page.tsx](src/app/pendapatan/page.tsx) baris 793 |
| `rounded-[20px]` | 2 | [login/page.tsx](src/app/login/page.tsx) baris 321 |
| `rounded-[32px]` | 5 | [users/page.tsx](src/app/dashboard/users/page.tsx), [discrepancy/page.tsx](src/app/dashboard/rekon/discrepancy/page.tsx) |

### 2.5 Tombol Serupa Fungsi, Style Berbeda

**Tombol "Export Excel"** di berbagai halaman:

| File | Baris | Styling Lengkap |
|------|-------|-----------------|
| [jurnal/page.tsx](src/app/dashboard/jurnal/page.tsx) | 124 | `h-10 px-4 bg-fin-surface border-fin-border rounded-xl font-bold text-[10px]` |
| [pendapatan/page.tsx](src/app/pendapatan/page.tsx) | 972 | `h-9 px-4 rounded-lg text-xs font-bold text-fin-text-muted border-[#D0D5DD]` |
| [talangan/page.tsx](src/app/dashboard/talangan/page.tsx) | 537 | `h-8 px-3 text-[10px] font-bold text-fin-text-muted hover:text-[#027A48]` |
| [ledgers/bank/page.tsx](src/app/dashboard/ledgers/bank/page.tsx) | 167 | `h-10 border-fin-border bg-fin-surface hover:bg-fin-income-bg` |
| [rekon/discrepancy/page.tsx](src/app/dashboard/rekon/discrepancy/page.tsx) | 365 | `h-10 bg-fin-surface text-fin-text-primary border-fin-border` |

**Tombol "Cetak / Cetak Laporan"** di berbagai halaman:

| File | Baris | Styling Lengkap |
|------|-------|-----------------|
| [jurnal/page.tsx](src/app/dashboard/jurnal/page.tsx) | 131 | `h-10 px-6 bg-fin-text-primary text-fin-surface rounded-xl font-bold text-[10px]` |
| [bku/page.tsx](src/app/dashboard/bku/page.tsx) | 320 | `h-10 px-6 bg-fin-text-primary text-fin-surface rounded-lg text-xs font-semibold hover:opacity-90` |
| [pendapatan/page.tsx](src/app/pendapatan/page.tsx) | 962 | `h-9 px-4 rounded-lg text-xs font-bold text-fin-text-muted border-[#D0D5DD]` |
| [rekon/bank/page.tsx](src/app/dashboard/rekon/bank/page.tsx) | 246 | `h-11 px-4 bg-white text-indigo-600 hover:bg-indigo-50 border-indigo-200 rounded-xl font-black text-xs uppercase` |
| [ledgers/pajak/page.tsx](src/app/dashboard/ledgers/pajak/page.tsx) | 119 | `h-10 bg-fin-text-primary text-fin-surface font-bold` |

**Tombol "Refresh"** di berbagai halaman:

| File | Baris | Styling Lengkap |
|------|-------|-----------------|
| [jurnal/page.tsx](src/app/dashboard/jurnal/page.tsx) | 116 | `h-10 px-4 bg-fin-surface border-fin-border rounded-xl font-bold text-[10px]` |
| [rekon/discrepancy/page.tsx](src/app/dashboard/rekon/discrepancy/page.tsx) | 362 | `h-10 gap-2 border-fin-border bg-fin-surface text-fin-text-primary` |
| [sp2d/kelengkapan/page.tsx](src/app/dashboard/sp2d/kelengkapan/page.tsx) | 345 | `h-8 px-3 text-xs border-fin-border gap-1.5` (outline variant) |
| [dashboard/page.tsx](src/app/dashboard/page.tsx) | 307 | `h-9 w-9 bg-fin-surface border-fin-border rounded-xl` (icon variant) |

---

## BAGIAN 3 — INVENTARISASI INPUT, SEARCH, FILTER, DROPDOWN

### 3.1 Search Input

| File | Baris | Height | Radius | Styling |
|------|-------|--------|--------|---------|
| [rekon/bank/page.tsx](src/app/dashboard/rekon/bank/page.tsx) | 318–324 | `h-11` | `rounded-xl` | `bg-fin-page border-fin-border text-xs font-bold` |
| [bku/page.tsx](src/app/dashboard/bku/page.tsx) | ~477 | `h-11` | `rounded-lg` | `bg-fin-page border-fin-border text-sm font-medium` |
| [pendapatan/page.tsx](src/app/pendapatan/page.tsx) | ~900 | `h-10` | `rounded-xl` | `bg-fin-page border-fin-border` |
| [pajak/page.tsx](src/app/dashboard/pajak/page.tsx) | ~110 | `h-10` | `rounded-lg` | `bg-fin-page border-fin-border` |

### 3.2 Date Range Input (Filter)

| File | Baris | Height | Radius | Catatan |
|------|-------|--------|--------|---------|
| [rekon/bank/page.tsx](src/app/dashboard/rekon/bank/page.tsx) | 331, 337 | `h-11` | `rounded-xl` | Start + End date |
| [bku/page.tsx](src/app/dashboard/bku/page.tsx) | 477, 481 | `h-11` | `rounded-lg` | Start + End date |
| [sp2d/kelengkapan/page.tsx](src/app/dashboard/sp2d/kelengkapan/page.tsx) | 362 | `h-8` | default | Bulk date picker |
| [sp2d/kelengkapan/page.tsx](src/app/dashboard/sp2d/kelengkapan/page.tsx) | 459, 489 | `h-7` | default | Per-row inline date |

**Masalah**: 4 kombinasi height (h-7, h-8, h-11, h-11) dan 3 radius (default, rounded-lg, rounded-xl) untuk fungsi yang sama.

### 3.3 Dropdown / Select — Mix Dua Implementasi

#### Native `<select>` HTML (tidak konsisten dengan shadcn):

| File | Baris | Styling |
|------|-------|---------|
| [bku/page.tsx](src/app/dashboard/bku/page.tsx) | 493–502 | `w-full h-11 px-4 bg-fin-subtle border-fin-border rounded-lg outline-none appearance-none` |
| [dashboard/page.tsx](src/app/dashboard/page.tsx) | 291–304 | `bg-transparent outline-none font-black text-xs cursor-pointer appearance-none pr-4` |

#### Shadcn `<Select>` (pendekatan yang benar):

| File | Baris | Styling |
|------|-------|---------|
| [sp2d/kelengkapan/page.tsx](src/app/dashboard/sp2d/kelengkapan/page.tsx) | 322–344 | `h-8 w-24 text-xs border-fin-border` |
| [pendapatan/page.tsx](src/app/pendapatan/page.tsx) | ~berbagai | `bg-fin-page border-fin-border` |
| [talangan/page.tsx](src/app/dashboard/talangan/page.tsx) | ~berbagai | Shadcn dengan className override |
| [penyesuaian/page.tsx](src/app/dashboard/penyesuaian/page.tsx) | ~berbagai | `bg-fin-page border-fin-border` |

### 3.4 Label di atas Input

| Style | File | Konsisten? |
|-------|------|------------|
| `text-[10px] font-bold uppercase text-fin-text-muted` | Mayoritas halaman | ✅ Dominan |
| `text-xs font-bold text-fin-text-muted` | Beberapa halaman | ⚠️ Sedikit berbeda |
| `text-[11px] font-bold` | [pendapatan/page.tsx](src/app/pendapatan/page.tsx) | ❌ Berbeda |

### 3.5 Focus Ring Tidak Konsisten

| Pattern | File | Baris |
|---------|------|-------|
| `focus:border-indigo-600` | [simulator/page.tsx](src/app/dashboard/simulator/page.tsx), [pendapatan/page.tsx](src/app/pendapatan/page.tsx) | Berbagai |
| `focus:border-[#2E90FA]` | [penyesuaian/page.tsx](src/app/dashboard/penyesuaian/page.tsx), [master-data/page.tsx](src/app/dashboard/master-data/page.tsx) | Berbagai |
| `focus:border-indigo-500` | [talangan/page.tsx](src/app/dashboard/talangan/page.tsx) | Berbagai |
| `focus:ring-fin-info/20` | [ledgers/bank/page.tsx](src/app/dashboard/ledgers/bank/page.tsx) | Berbagai |
| `focus:ring-4 focus:ring-indigo-500/5` | [login/page.tsx](src/app/login/page.tsx) | 148 |
| *(tidak ada explicit focus)* | Banyak halaman | — |

---

## BAGIAN 4 — INVENTARISASI TABEL DATA

### 4.1 Implementasi per Halaman

| Halaman | Implementasi | Pagination | Checkbox | Row Anim | Catatan |
|---------|-------------|-----------|----------|----------|---------|
| [sp2d/page.tsx](src/app/dashboard/sp2d/page.tsx) | shadcn `<Table>` | ✅ A+B | ✅ | — | Sort, filter |
| [sp2d/kelengkapan/page.tsx](src/app/dashboard/sp2d/kelengkapan/page.tsx) | shadcn `<Table>` | ✅ Variasi B | ✅ | — | Inline input per baris |
| [rekon/bank/page.tsx](src/app/dashboard/rekon/bank/page.tsx) | shadcn `<Table>` | ✅ Variasi B | — | — | Badge matched/unmatched |
| [rekon/page.tsx](src/app/dashboard/rekon/page.tsx) | shadcn `<Table>` | ✅ | — | — | Split panel BKU + Bank |
| [bku/page.tsx](src/app/dashboard/bku/page.tsx) | shadcn `<Table>` + Footer | ✅ Variasi A | — | — | Total row di footer |
| [pendapatan/page.tsx](src/app/pendapatan/page.tsx) | shadcn `<Table>` | ✅ | ✅ | — | Bg header hardcoded `#F8F9FA` |
| [jurnal/page.tsx](src/app/dashboard/jurnal/page.tsx) | shadcn `<Table>` | ✅ Variasi B | — | — | Skeleton loading |
| [talangan/page.tsx](src/app/dashboard/talangan/page.tsx) | shadcn `<Table>` | ✅ | — | — | Expandable rows |
| [ledgers/bank/page.tsx](src/app/dashboard/ledgers/bank/page.tsx) | shadcn `<Table>` | ✅ | — | ✅ `motion.tr` | |
| [ledgers/pajak/page.tsx](src/app/dashboard/ledgers/pajak/page.tsx) | shadcn `<Table>` | — | — | ✅ `motion.tr` | |
| [ledgers/opd/page.tsx](src/app/dashboard/ledgers/opd/page.tsx) | shadcn `<Table>` | — | — | ✅ `motion.tr` | |
| [master-data/page.tsx](src/app/dashboard/master-data/page.tsx) | shadcn `<Table>` | — | — | — | Simple CRUD list |
| [pajak/page.tsx](src/app/dashboard/pajak/page.tsx) | shadcn `<Table>` | ✅ | — | — | |
| [**rekon/discrepancy/page.tsx**](src/app/dashboard/rekon/discrepancy/page.tsx) | **native `<table>`** | — | — | — | ❌ Tidak pakai shadcn |
| [**rekon/anomalies/page.tsx**](src/app/dashboard/rekon/anomalies/page.tsx) | **native `<table>`** | — | — | — | ❌ Tidak pakai shadcn |
| [**users/page.tsx**](src/app/dashboard/users/page.tsx) | **native/custom** | — | — | — | ❌ Tidak pakai shadcn |

### 4.2 TableHeader Background Tidak Konsisten

| Style | File | Catatan |
|-------|------|---------|
| `bg-fin-page` | [jurnal/page.tsx](src/app/dashboard/jurnal/page.tsx), [bku/page.tsx](src/app/dashboard/bku/page.tsx), [rekon/page.tsx](src/app/dashboard/rekon/page.tsx) | ✅ Paling benar |
| `bg-fin-page/50` | [sp2d/kelengkapan/page.tsx](src/app/dashboard/sp2d/kelengkapan/page.tsx), [rekon/bank/page.tsx](src/app/dashboard/rekon/bank/page.tsx) | ✅ OK |
| `bg-fin-page/60` | [sp2d/kelengkapan/page.tsx](src/app/dashboard/sp2d/kelengkapan/page.tsx) (potongan tab) | ⚠️ Sedikit berbeda |
| `bg-[#F8F9FA]` hardcoded | [pendapatan/page.tsx](src/app/pendapatan/page.tsx) | ❌ Harusnya `bg-fin-page` |
| `bg-[#F8F9FA]/50` hardcoded | Beberapa halaman | ❌ Harusnya `bg-fin-page/50` |

### 4.3 Pagination — 3 Variasi Berbeda

**Variasi A** — Previous/Next + Numbered Pages (bku, rekon):
```
File: bku/page.tsx baris 680–726
Style: h-9 w-9 icon buttons + numbered 1–5
Selected: bg-[#101828] text-white
Unselected: bg-fin-surface border-fin-border text-fin-text-muted
```

**Variasi B** — Previous/Next Simple (kelengkapan, rekon/bank, jurnal):
```
File: rekon/bank/page.tsx baris 449–467 → h-8 px-3 text-[10px] outline variant
File: sp2d/kelengkapan/page.tsx baris 510–515 → h-7 w-7 p-0 outline variant
File: jurnal/page.tsx baris 211, 220 → h-10 px-5 text-[10px] font-black uppercase
```

**Variasi C** — Tidak ada pagination: master-data, simulator, beberapa ledger.

### 4.4 DataTable.tsx — Komponen Orphaned
**File**: [src/components/ui/DataTable.tsx](src/components/ui/DataTable.tsx)
- Terdefinisi dengan loading state, empty state, configurable columns
- **Tidak diimport di halaman manapun** — kemungkinan orphaned/unused

---

## BAGIAN 5 — INVENTARISASI MODAL/DIALOG DAN FORM

### 5.1 Modal Sizing — 10 Variasi Tanpa Standar

| Max Width | File | Baris | Konten |
|-----------|------|-------|--------|
| `max-w-[400px]` | [users/page.tsx](src/app/dashboard/users/page.tsx) | ~280 | Reset Password |
| `max-w-[425px]` | [users/page.tsx](src/app/dashboard/users/page.tsx) | ~181 | Add User form |
| `max-w-md` (448px) | [rekon/bank/page.tsx](src/app/dashboard/rekon/bank/page.tsx) | ~595 | Reset confirmation |
| `max-w-md` | [master-data/page.tsx](src/app/dashboard/master-data/page.tsx) | ~231 | Add/Edit form |
| `max-w-md` | [rekon/discrepancy/page.tsx](src/app/dashboard/rekon/discrepancy/page.tsx) | ~533 | Resolution form |
| `max-w-lg` (512px) | [talangan/page.tsx](src/app/dashboard/talangan/page.tsx) | ~768 | Assign talangan |
| `max-w-2xl` (672px) | [talangan/page.tsx](src/app/dashboard/talangan/page.tsx) | ~847 | Split alokasi |
| `max-w-2xl` | [simulator/page.tsx](src/app/dashboard/simulator/page.tsx) | ~487 | SP2D injection |
| `max-w-4xl` (896px) | [rekon/bank/page.tsx](src/app/dashboard/rekon/bank/page.tsx) | ~476 | Upload bank statement |
| `max-w-[1000px]` | [rekon/discrepancy/page.tsx](src/app/dashboard/rekon/discrepancy/page.tsx) | ~590 | BAR report form |
| `max-w-6xl` (1152px) | [pendapatan/page.tsx](src/app/pendapatan/page.tsx) | ~1314 | PDF preview |

> `max-w-[425px]` vs `max-w-md` (448px) dipakai untuk konten serupa (user form). Perbedaannya 23px tanpa alasan jelas.

### 5.2 Modal Header Style — 2 Pendekatan Berbeda

**Pendekatan A — Dark Header (`bg-[#101828]`) + `DialogContent p-0`:**
```
File: rekon/bank/page.tsx baris 476 (upload modal)
File: users/page.tsx baris 183 (add user)
Style: p-0 border-none shadow-2xl | header section: bg-[#101828] text-white p-6
```

**Pendekatan B — Default shadcn padding:**
```
File: master-data/page.tsx baris 231
File: talangan/page.tsx (assign modal)
File: sp2d/kelengkapan/page.tsx
Style: Default DialogHeader/DialogTitle dengan padding standar shadcn
```

### 5.3 Modal Footer Button Order — 2 Konvensi Berbeda

| File | Baris | Urutan | Catatan |
|------|-------|--------|---------|
| [rekon/bank/page.tsx](src/app/dashboard/rekon/bank/page.tsx) (upload) | 560–573 | **[Simpan] [Batal]** | Confirm dulu |
| [rekon/bank/page.tsx](src/app/dashboard/rekon/bank/page.tsx) (reset) | 623–637 | **[Bersihkan] [Batal]** | Confirm dulu |
| [talangan/page.tsx](src/app/dashboard/talangan/page.tsx) (split) | 989–1000 | **[Batal] [Simpan]** | Cancel dulu |

### 5.4 Form Validation
- Mayoritas form tidak memiliki error message yang terlihat
- Input langsung dikirim tanpa feedback visual saat gagal
- [react-hook-form](src) hanya dipakai di ~5 form kompleks; sisanya pakai controlled state biasa

### 5.5 Daftar Semua Modal per Halaman

| Halaman | Modal | Max Width | Style Header |
|---------|-------|-----------|--------------|
| [pendapatan/page.tsx](src/app/pendapatan/page.tsx) | PDF Preview | `max-w-6xl` | Default |
| [pendapatan/page.tsx](src/app/pendapatan/page.tsx) | Reconciliation | `max-w-md` | Default |
| [pendapatan/page.tsx](src/app/pendapatan/page.tsx) | Cash Monitor | `max-w-5xl` (motion.div) | — |
| [rekon/bank/page.tsx](src/app/dashboard/rekon/bank/page.tsx) | Upload RK | `max-w-4xl` | Dark (`#101828`) |
| [rekon/bank/page.tsx](src/app/dashboard/rekon/bank/page.tsx) | Reset Data | `max-w-md` | Rose (`bg-rose-600`) |
| [dashboard/page.tsx](src/app/dashboard/page.tsx) | Pagu Budget | `max-w-xl` | Default |
| [dashboard/page.tsx](src/app/dashboard/page.tsx) | Anomaly | `max-w-lg` | Default |
| [talangan/page.tsx](src/app/dashboard/talangan/page.tsx) | Assign | `max-w-lg` | Default |
| [talangan/page.tsx](src/app/dashboard/talangan/page.tsx) | Split | `max-w-2xl` | Default |
| [talangan/page.tsx](src/app/dashboard/talangan/page.tsx) | Manual Input | `max-w-lg` | Default |
| [master-data/page.tsx](src/app/dashboard/master-data/page.tsx) | Add/Edit | `max-w-md` | Default |
| [simulator/page.tsx](src/app/dashboard/simulator/page.tsx) | SP2D Inject | `max-w-2xl` | Default |
| [users/page.tsx](src/app/dashboard/users/page.tsx) | Add User | `max-w-[425px]` | Dark (`#101828`) |
| [users/page.tsx](src/app/dashboard/users/page.tsx) | Reset Password | `max-w-[400px]` | Default |
| [rekon/discrepancy/page.tsx](src/app/dashboard/rekon/discrepancy/page.tsx) | Resolution | `max-w-md` | Default |
| [rekon/discrepancy/page.tsx](src/app/dashboard/rekon/discrepancy/page.tsx) | BAR Report | `max-w-[1000px]` | Default |
| [ledgers/bank/page.tsx](src/app/dashboard/ledgers/bank/page.tsx) | PDF Preview | fixed overlay | — |
| [ledgers/pajak/page.tsx](src/app/dashboard/ledgers/pajak/page.tsx) | PDF Preview | fixed overlay | — |
| [ledgers/opd/page.tsx](src/app/dashboard/ledgers/opd/page.tsx) | PDF Preview | fixed overlay | — |

---

## BAGIAN 6 — WARNA MENTAH DAN UKURAN TIDAK KONSISTEN

### 6.1 Design Tokens yang Sudah Ada (Tapi Sering Tidak Dipakai)
**File**: [src/app/globals.css](src/app/globals.css) baris 7–98

```css
/* Light mode tokens */
--fin-page: #F8F9FA          /* bg halaman */
--fin-surface: #FFFFFF       /* surface card/input */
--fin-subtle: #F2F4F7        /* subtle bg */
--fin-border: #E9ECEF        /* border umum */
--fin-text-primary: #101828  /* teks utama / dark primary */
--fin-text-secondary: #475467
--fin-text-muted: #98A2B3
--fin-income: #12B76A        /* warna masuk/income */
--fin-income-bg: #ECFDF3
--fin-income-text: #027A48
--fin-expense: #F04438       /* warna keluar/expense */
--fin-expense-bg: #FEF3F2
--fin-expense-text: #B42318
--fin-info: #2E90FA          /* warna info/link */
--fin-info-bg: #EFF8FF
--fin-info-text: #175CD3
--fin-warning: #F79009
--fin-warning-bg: #FFFAEB
--fin-warning-text: #B54708
--fin-surplus: #6941C6
/* + dark mode overrides baris 416–434 */
```

### 6.2 Top 20 Hardcoded Hex yang Harus Diganti Token

| Hex Mentah | Pemakaian | Token yang Tepat | Catatan |
|-----------|-----------|-----------------|---------|
| `#101828` | 45+ | `fin-text-primary` | Paling banyak disalahgunakan |
| `#475467` | 42+ | `fin-text-secondary` | |
| `#98A2B3` | 38+ | `fin-text-muted` | |
| `#F2F4F7` / `#F2F4F7` | 28+ | `fin-subtle` | |
| `#E9ECEF` | 35+ | `fin-border` | |
| `#F8F9FA` | 32+ | `fin-page` | |
| `#F04438` | 15+ | `fin-expense` | |
| `#2E90FA` | 22+ | `fin-info` | |
| `#B42318` | 20+ | `fin-expense-text` | |
| `#FEF3F2` | 18+ | `fin-expense-bg` | |
| `#027A48` | 16+ | `fin-income-text` | |
| `#ECFDF3` | 14+ | `fin-income-bg` | |
| `#12B76A` | 12+ | `fin-income` | |
| `#6941C6` | 8+ | `fin-surplus` | |
| `#175CD3` | 6+ | `fin-info-text` | |
| `#EFF8FF` | 6+ | `fin-info-bg` | |
| `#B54708` | 5+ | `fin-warning-text` | |
| `#FFFAEB` | 5+ | `fin-warning-bg` | |
| `#1D2939` | 10+ | → `hover:opacity-90` pada `fin-text-primary` | Token baru atau pakai opacity |
| `#D0D5DD` | 10+ | → Token baru `fin-border-medium` | Belum ada di tokens |

> **Total**: ~803 occurrences (345 `bg-[#xxx]` + 458 `text-[#xxx]`)

### 6.3 `bg-indigo-600` — Tidak Ada di Design System

`bg-indigo-600` (#4F46E5) digunakan ~25 kali sebagai warna primary action, tapi **tidak terdefinisi di tokens manapun** dan berbeda dari `fin-text-primary` (#101828):

| File | Baris | Konteks |
|------|-------|---------|
| [login/page.tsx](src/app/login/page.tsx) | 321 | Submit login button |
| [sp2d/kelengkapan/page.tsx](src/app/dashboard/sp2d/kelengkapan/page.tsx) | 368, 462, 492 | Terapkan + Simpan per baris |
| [rekon/discrepancy/page.tsx](src/app/dashboard/rekon/discrepancy/page.tsx) | 369 | Generate BAR |
| [talangan/page.tsx](src/app/dashboard/talangan/page.tsx) | 839, 1000 | Assign + Split primary |
| [button.tsx](src/components/ui/button.tsx) | 11 | **Default variant button itu sendiri** |

> Ini berarti `<Button>` (default variant) dari shadcn menggunakan `indigo-600`, tapi halaman-halaman lama menggunakan `fin-text-primary` (#101828) untuk primary. Dua "primary" yang berbeda warna.

### 6.4 Font Size Mentah

| Ukuran | Pemakaian | Digunakan Untuk |
|--------|-----------|-----------------|
| `text-[10px]` | 89+ | Label, badge text, table header, filter label |
| `text-[11px]` | 34+ | Caption, helper text, secondary info |
| `text-[13px]` | 12+ | Body text variant (antara xs dan sm) |
| `text-[9px]` | 8+ | Tiny labels, micro badges |
| `text-[12px]` | 5+ | Occasional override |

**Masalah**: Tailwind tidak punya class default untuk 10px, 11px, 13px — semuanya harus pakai arbitrary value. Perlu custom utility class:
```css
/* Usulan di globals.css atau tailwind.config: */
.text-micro { font-size: 10px; }  /* atau text-[10px] → custom name */
.text-mini  { font-size: 11px; }
```

### 6.5 Border Color Hardcoded

| Hex | Pemakaian | File Contoh | Baris |
|-----|-----------|-------------|-------|
| `border-[#D0D5DD]` | 10+ | [pendapatan/page.tsx](src/app/pendapatan/page.tsx) | 927, 962, 972, 1328 |
| `border-[#EAECF0]` | 12+ | [pendapatan/page.tsx](src/app/pendapatan/page.tsx) | 914, 957 |
| `border-[#E9ECEF]` | 35+ | Berbagai | — |
| `border-white/10` | 5+ | [login/page.tsx](src/app/login/page.tsx) | 148 |

Semua `border-[#E9ECEF]` seharusnya `border-fin-border`. `border-[#D0D5DD]` perlu token baru atau ganti ke `border-fin-border`.

### 6.6 Radius Arbitrary

| Radius | File | Baris | Catatan |
|--------|------|-------|---------|
| `rounded-[24px]` | [pendapatan/page.tsx](src/app/pendapatan/page.tsx) | 793 | Submit form button |
| `rounded-[20px]` | [login/page.tsx](src/app/login/page.tsx) | 321 | Login button |
| `rounded-[32px]` | [users/page.tsx](src/app/dashboard/users/page.tsx), [discrepancy/page.tsx](src/app/dashboard/rekon/discrepancy/page.tsx) | 175, 233, 287, 590 | Dialog, buttons |
| `rounded-[40px]` | [login/page.tsx](src/app/login/page.tsx) | ~200 | Login card |
| `rounded-[18px]` | [login/page.tsx](src/app/login/page.tsx) | ~148 | Login input |

---

## RINGKASAN REKOMENDASI PRIORITAS

### 🔴 Prioritas 1 — Segera (Inkonsistensi Fungsional)

1. **Tentukan 1 warna primary button** — Pilih `bg-fin-text-primary` atau tambahkan token `--fin-primary: #101828` dan ganti semua `bg-[#101828]` + `bg-indigo-600` ke token tersebut
2. **Ganti native `<select>`** di [bku/page.tsx](src/app/dashboard/bku/page.tsx) baris 493 dan [dashboard/page.tsx](src/app/dashboard/page.tsx) baris 291 ke shadcn `<Select>`
3. **Standardisasi 3 halaman native `<table>`**: [rekon/discrepancy/page.tsx](src/app/dashboard/rekon/discrepancy/page.tsx), [rekon/anomalies/page.tsx](src/app/dashboard/rekon/anomalies/page.tsx), [users/page.tsx](src/app/dashboard/users/page.tsx)

### 🟡 Prioritas 2 — Standardisasi Komponen

4. **Button height standard**: tentukan hierarki — `h-7` (compact), `h-9` (default), `h-11` (large)
5. **Radius standard**: gunakan hanya `rounded-lg` (button/input) dan `rounded-xl` (card/modal)
6. **Pagination standard**: pilih salah satu pola (Variasi A atau B), hapus variasi yang lain
7. **Modal sizing standard**: tentukan 4 ukuran saja — sm(`max-w-sm`), md(`max-w-md`), lg(`max-w-2xl`), xl(`max-w-5xl`)
8. **Focus ring standard**: pilih satu — `focus:ring-2 focus:ring-fin-info/30` untuk semua input

### 🟢 Prioritas 3 — Token Cleanup (Otomatable)

9. **Ganti 803 hardcoded hex** ke design tokens yang sudah ada (bisa pakai find-replace)
10. **Tambahkan custom Tailwind utilities** untuk `text-[10px]` dan `text-[11px]` yang dipakai 123x total
11. **Hapus atau integrasikan DataTable.tsx** yang saat ini orphaned
12. **Modal header consistency**: pilih Pendekatan A (dark) atau B (default) untuk semua modal
13. **Tambahkan token** `fin-border-light` untuk `#D0D5DD` dan `fin-primary-hover` untuk `#1D2939`
