# STYLEGUIDE — DSS BPKAD

Panduan kapan dan cara pakai komponen design system. Baca sebelum mengubah atau membuat UI baru.

---

## 1. Warna & Token

Semua warna harus pakai CSS custom properties, **jangan hardcode hex**. Token yang tersedia:

### Warna Semantik (`fin-*`)
| Token | Nilai | Kapan Pakai |
|---|---|---|
| `fin-text-primary` | #101828 | Teks utama, heading |
| `fin-text-secondary` | #475467 | Teks pendukung, label |
| `fin-text-muted` | #98A2B3 | Placeholder, hint, secondary label |
| `fin-page` | #F9FAFB | Background halaman |
| `fin-surface` | #FFFFFF | Card, modal, dropdown |
| `fin-border` | #E4E7EC | Semua border |
| `fin-subtle` | #F2F4F7 | Hover state, row stripe |
| `fin-income` | #12B76A | Nilai positif/pendapatan |
| `fin-income-bg` | #ECFDF3 | Background badge income |
| `fin-income-text` | #027A48 | Teks badge income |
| `fin-expense` | #F04438 | Nilai negatif/error |
| `fin-expense-bg` | #FEF3F2 | Background badge expense |
| `fin-expense-text` | #B42318 | Teks badge expense |
| `fin-info` | #2E90FA | Aksen biru, link |
| `fin-info-bg` | #EFF8FF | Background badge info |
| `fin-info-text` | #175CD3 | Teks badge info |
| `fin-warning` | #F79009 | Peringatan |
| `fin-warning-bg` | #FFFAEB | Background badge warning |
| `fin-warning-text` | #B54708 | Teks badge warning |
| `fin-surplus` | #6941C6 | Surplus/ungu |

### Token DS Semantik (`ds-*`)
| Token | Maps to | Kapan Pakai |
|---|---|---|
| `ds-primary` | fin-text-primary (#101828) | Button primary, aksi utama |
| `ds-primary-hover` | #1D2939 | Hover tombol primary |
| `ds-primary-fg` | #FFFFFF | Teks di atas primary |
| `ds-accent` | fin-info (#2E90FA) | Button accent, Generate, AI action |
| `ds-accent-hover` | fin-info-text | Hover tombol accent |
| `ds-accent-fg` | #FFFFFF | Teks di atas accent |
| `ds-focus-ring` | fin-info | Focus ring semua input |

### Typography Scale
| Class | Ukuran | Kapan Pakai |
|---|---|---|
| `text-micro` | 10px | Label uppercase, header tabel, badge kecil |
| `text-mini` | 11px | Caption, helper text sekunder |
| `text-caption` | 13px | Body text varian kecil |
| `text-xs` | 12px | Tombol sm, tag |
| `text-sm` | 14px | Body default, teks tabel |
| `text-base` | 16px | Judul dialog, heading kartu |
| `text-lg` | 18px | PageHeader title |

---

## 2. Button

File: `components/ui/button.tsx`

### Kapan pakai variant apa

| Variant | Kapan | Contoh |
|---|---|---|
| `primary` | **Satu aksi utama per halaman/modal** | Simpan, Konfirmasi, Proses |
| `accent` | Aksi generatif/AI, tidak destruktif | Generate BA, Auto-Match, Analisis AI |
| `outline` | Aksi sekunder di samping primary | Batal, Export, Refresh |
| `secondary` | Aksi tersier, tidak critical | Lihat Detail, Filter |
| `ghost` | Ikon kecil, tombol navigasi tersembunyi | ⋯ kebab menu, Tutup, icon nav |
| `destructive` | Aksi tidak bisa dibatalkan | Hapus Data, Reset Permanen |
| `income` | Konfirmasi positif berhubungan uang | Setujui, Terima |

### Kapan pakai size apa

| Size | Height | Kapan |
|---|---|---|
| `sm` | 32px | Tabel action, inline compact |
| `md` | 40px | Default — filter bar, form biasa |
| `lg` | 44px | Header halaman, CTA utama |
| `icon` | 32×32 | Tombol ikon saja (tanpa teks) |
| `icon-sm` | 28×28 | Ikon sangat kecil (close button, dll) |
| `icon-md` | 40×40 | Ikon medium standar |

### Aturan
- Satu halaman / satu modal: **maks 1 tombol `primary`**. Sisanya `outline` atau `ghost`.
- Semua tombol di satu baris harus **satu size** (jangan campurkan `sm` dan `md`).
- Loading state: pakai prop `loading` — jangan disable manual + ganti teks sendiri.

```tsx
// Benar
<Button variant="primary" size="md" loading={isSubmitting} onClick={handleSave}>
  Simpan
</Button>

// Salah — hardcode warna
<button className="bg-[#101828] text-white rounded-lg px-4 py-2">Simpan</button>
```

---

## 3. Input

File: `components/ui/input.tsx`

- Height standar: `h-input` (40px) — jangan override kecuali ada alasan kuat.
- Focus ring otomatis via `ds-focus-ring`. Jangan tambah `focus:border-indigo-600` lagi.
- Untuk label + error + hint, selalu wrap dengan `<FormField>`.

```tsx
// Benar
<FormField label="Nominal" required error={errors.nominal?.message}>
  <Input id="nominal" type="number" {...register("nominal")} aria-invalid={!!errors.nominal} />
</FormField>

// Salah — label manual tanpa wrapper
<label className="text-[10px] font-bold uppercase">Nominal</label>
<Input className="h-10" />
<span className="text-red-500 text-xs">{error}</span>
```

---

## 4. SearchInput

File: `components/ui/search-input.tsx`

Gunakan untuk semua field pencarian. Sudah ada debounce, clear button, dan search icon.

```tsx
<SearchInput
  value={search}
  onSearch={setSearch}          // dipanggil setelah debounce
  onValueChange={setSearch}     // dipanggil setiap ketikan (opsional)
  debounceMs={300}              // default
  clearable                     // default true
  placeholder="Cari SP2D..."
  className="w-64"
/>
```

Jangan pakai `<Input>` biasa dengan ikon search manual untuk halaman yang sudah ada.

---

## 5. Select

File: `components/ui/select.tsx`

Gunakan untuk **semua dropdown pilihan**, termasuk filter. Jangan pakai native `<select>` kecuali di dalam komponen yang butuh form submission HTML native.

```tsx
<FormField label="Status">
  <Select value={status} onValueChange={setStatus}>
    <SelectTrigger className="w-40">
      <SelectValue placeholder="Semua Status" />
    </SelectTrigger>
    <SelectContent>
      <SelectItem value="">Semua</SelectItem>
      <SelectItem value="matched">Cocok</SelectItem>
      <SelectItem value="unmatched">Belum Cocok</SelectItem>
    </SelectContent>
  </Select>
</FormField>
```

Size `"sm"` (h-8) untuk filter di atas tabel. `"default"` (h-input) untuk form modal.

---

## 6. Dialog / Modal

File: `components/ui/dialog.tsx`

### Kapan pakai size apa

| Size | max-width | Kapan |
|---|---|---|
| `sm` | 384px | Konfirmasi singkat (hapus, reset) |
| `md` | 448px | Form 2–4 field (tambah, edit sederhana) — **default** |
| `lg` | 672px | Form kompleks, tabel kecil di dalam modal |
| `xl` | 1024px | Preview PDF, tabel besar, BAR document |
| `full` | 100vw-2rem | Jarang — editor fullscreen |

### Struktur standar

```tsx
<Dialog open={open} onOpenChange={setOpen}>
  <DialogContent size="md">
    <DialogHeader>
      <DialogTitle>Tambah Rekening</DialogTitle>
      <DialogDescription>Isi data rekening baru.</DialogDescription>
    </DialogHeader>
    <DialogBody>
      {/* form fields */}
    </DialogBody>
    <DialogFooter>
      <Button variant="outline" onClick={() => setOpen(false)}>Batal</Button>
      <Button variant="primary" loading={isLoading} onClick={handleSave}>Simpan</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

### Aturan
- Selalu gunakan `<DialogBody>` untuk konten agar padding konsisten.
- Urutan tombol di `<DialogFooter>`: **Batal dulu, Confirm di kanan** (sesuai konvensi macOS/web).
- `showCloseButton` di `DialogContent` default `true` — cukup untuk dialog informatif. Untuk form: tombol Batal di footer sudah cukup, nonaktifkan close button jika UX butuh explicit cancel.

---

## 7. PageHeader

File: `components/patterns/page-header.tsx`

Gunakan di **setiap halaman dashboard** sebagai judul konsisten.

```tsx
<PageHeader
  title="Rekonsiliasi Bank"
  description="Cocokkan mutasi BKU dengan rekening koran"
  icon={<Landmark className="size-5" />}
  badge={<Badge variant="info">{unmatchedCount} belum cocok</Badge>}
  actions={
    <>
      <Button variant="outline" leftIcon={<Download />}>Export</Button>
      <Button variant="primary" leftIcon={<Plus />}>Upload Mutasi</Button>
    </>
  }
/>
```

---

## 8. FilterBar

File: `components/patterns/filter-bar.tsx`

Taruh antara `<PageHeader>` dan `<DataTable>`. Tangani semua filter di satu baris.

```tsx
<FilterBar
  isFiltered={!!search || !!statusFilter || !!dateRange}
  onReset={handleReset}
  actions={<Button variant="primary" leftIcon={<Plus />}>Tambah</Button>}
>
  <SearchInput value={search} onSearch={setSearch} className="w-64" />
  <Select value={statusFilter} onValueChange={setStatusFilter}>
    <SelectTrigger size="sm" className="w-36">
      <SelectValue placeholder="Status" />
    </SelectTrigger>
    <SelectContent>…</SelectContent>
  </Select>
</FilterBar>
```

---

## 9. DataTable

File: `components/patterns/data-table.tsx`

Gunakan untuk **semua tabel data** — gantikan native `<table>` dan implementasi tabel ad-hoc.

```tsx
const columns: ColumnDef<SP2D>[] = [
  {
    id: "nomor",
    header: "No. SP2D",
    cell: (r) => r.nomor_sp2d,
    sortable: true,
    sortAccessor: (r) => r.nomor_sp2d,
    width: 160,
  },
  {
    id: "nilai",
    header: "Nilai",
    cell: (r) => <span className="text-fin-text-primary font-mono">{formatRupiah(r.nilai)}</span>,
    headerClassName: "text-right",
    cellClassName: "text-right",
  },
  {
    id: "actions",
    header: "",
    cell: (r) => (
      <Button variant="ghost" size="icon-sm" onClick={() => handleEdit(r)}>
        <Pencil />
      </Button>
    ),
    width: 48,
  },
]

<DataTable
  data={rows}
  columns={columns}
  loading={isLoading}
  pagination
  defaultPageSize={25}
  stickyHeader
  maxHeight="60vh"
  rowKey={(r) => r.id}
  onRowClick={(r) => router.push(`/sp2d/${r.id}`)}
  emptyState={{
    title: "Belum ada SP2D",
    description: "Upload file SP2D untuk memulai.",
    action: <Button variant="outline">Upload</Button>,
  }}
/>
```

### Aturan
- Selalu set `rowKey` agar React tidak re-render semua rows.
- Kolom uang: `headerClassName="text-right" cellClassName="text-right font-mono"`.
- Kolom status: gunakan `<Badge>` yang sesuai variant (income/expense/info/warning).
- Action column: lebar tetap `width={48}`, tanpa header, posisi paling kanan.

---

## 10. FormField

File: `components/patterns/form-field.tsx`

Semua field dalam form modal/halaman wajib dibungkus `<FormField>`.

```tsx
<FormField
  label="Tanggal SP2D"
  htmlFor="tanggal"
  required
  error={errors.tanggal?.message}
  hint="Format: DD/MM/YYYY"
>
  <Input id="tanggal" type="date" {...register("tanggal")} aria-invalid={!!errors.tanggal} />
</FormField>
```

- `label` pakai `text-micro font-bold uppercase` otomatis — jangan override.
- `error` menggantikan `hint` — tidak muncul bersamaan.
- `required` menampilkan asterisk merah — tidak otomatis memvalidasi.

---

## 11. Migrasi Bertahap

Halaman lama tidak akan disentuh sekaligus. Panduan saat mengerjakan halaman baru atau perbaikan:

1. **Import dari design system** — `@/components/ui/button`, bukan `components/Button.tsx` atau button inline.
2. **Hapus warna hardcode** saat kamu menyentuh sebuah section — `bg-[#101828]` → `bg-ds-primary`, `text-[#475467]` → `text-fin-text-secondary`, dst.
3. **Gunakan token height** — `h-btn-md` bukan `h-10`, `h-input` bukan `h-10` (walaupun nilainya sama, token lebih maintainable).
4. **Jangan campurkan** native `<select>` dengan shadcn `<Select>` dalam satu halaman.
5. **Satu primary button per modal/section** — sisanya `outline` atau `ghost`.

### Mapping warna hardcode → token

| Lama (hardcode) | Baru (token) |
|---|---|
| `bg-[#101828]`, `text-[#101828]` | `bg-ds-primary`, `text-fin-text-primary` |
| `bg-[#1D2939]` | `bg-ds-primary-hover` |
| `bg-indigo-600`, `hover:bg-indigo-700` | `bg-ds-primary hover:bg-ds-primary-hover` |
| `bg-[#2E90FA]`, `text-[#2E90FA]` | `bg-ds-accent`, `text-fin-info` |
| `text-[#475467]` | `text-fin-text-secondary` |
| `text-[#98A2B3]` | `text-fin-text-muted` |
| `bg-[#F8F9FA]`, `bg-[#F2F4F7]` | `bg-fin-page`, `bg-fin-subtle` |
| `border-[#E9ECEF]`, `border-[#D0D5DD]` | `border-fin-border` |
| `focus:border-indigo-600`, `focus:border-[#2E90FA]` | (otomatis via komponen) |
