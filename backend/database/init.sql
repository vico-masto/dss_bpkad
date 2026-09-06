-- 1. Tabel Master
CREATE TABLE IF NOT EXISTS master_sumber_dana (
    id VARCHAR(50) PRIMARY KEY,
    nama VARCHAR(255) NOT NULL,
    kategori VARCHAR(50) CHECK (kategori IN ('BEBAS', 'EARMARK'))
);

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) CHECK (role IN ('admin', 'Operator SP2D', 'Operator Penerimaan'))
);

CREATE TABLE IF NOT EXISTS master_opd (
    id VARCHAR(100) PRIMARY KEY,
    nama VARCHAR(255) NOT NULL
);

CREATE TABLE IF NOT EXISTS master_jenis_belanja (
    id VARCHAR(100) PRIMARY KEY,
    nama VARCHAR(255) NOT NULL
);

CREATE TABLE IF NOT EXISTS master_jenis_potongan (
    id VARCHAR(100) PRIMARY KEY,
    nama VARCHAR(255) NOT NULL
);

-- 2. Tabel Kas Masuk
CREATE TABLE IF NOT EXISTS data_pendapatan (
    id VARCHAR(100) PRIMARY KEY,
    tanggal DATE NOT NULL,
    tahun INT NOT NULL,
    nomor_bukti VARCHAR(100) UNIQUE NOT NULL,
    uraian TEXT,
    id_sumber_dana VARCHAR(50) REFERENCES master_sumber_dana(id),
    nilai NUMERIC(15, 2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. Tabel Header SP2D
CREATE TABLE IF NOT EXISTS data_sp2d (
    id VARCHAR(100) PRIMARY KEY,
    nomor VARCHAR(100) UNIQUE NOT NULL,
    tanggal DATE NOT NULL,
    tanggal_pencairan DATE,
    tahun INT NOT NULL,
    opd VARCHAR(255) NOT NULL,
    jenis VARCHAR(50) NOT NULL,
    uraian TEXT,
    penerima VARCHAR(255) NOT NULL,
    nilai_bruto NUMERIC(15, 2) NOT NULL,
    nilai_potongan NUMERIC(15, 2) DEFAULT 0,
    jenis_potongan VARCHAR(100),
    nilai_neto NUMERIC(15, 2) GENERATED ALWAYS AS (nilai_bruto - nilai_potongan) STORED,
    status_dana VARCHAR(50) CHECK (status_dana IN ('Aman', 'Talangan')),
    status_rekon VARCHAR(50) DEFAULT 'BELUM',
    sumber VARCHAR(20) DEFAULT 'MANUAL',
    file_url TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. Tabel Rincian SP2D (Mendukung Multi-Sumber Dana)
CREATE TABLE IF NOT EXISTS detail_sp2d (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_sp2d VARCHAR(100) REFERENCES data_sp2d(id) ON DELETE CASCADE,
    id_sumber_dana VARCHAR(50) REFERENCES master_sumber_dana(id),
    nilai_bruto NUMERIC(15, 2) NOT NULL,
    nilai_neto NUMERIC(15, 2) NOT NULL
);

-- 5. Tabel Jurnal Talangan
CREATE TABLE IF NOT EXISTS jurnal_talangan (
    id VARCHAR(100) PRIMARY KEY,
    tanggal DATE NOT NULL,
    no_referensi VARCHAR(100),
    uraian TEXT,
    id_sumber_asli VARCHAR(50) REFERENCES master_sumber_dana(id),
    id_sumber_talangan VARCHAR(50) REFERENCES master_sumber_dana(id),
    nilai NUMERIC(15, 2) NOT NULL,
    status VARCHAR(50) CHECK (status IN ('BELUM', 'SELESAI')) DEFAULT 'BELUM',
    tanggal_selesai TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 6. Tabel Penyesuaian (Jurnal Koreksi)
CREATE TABLE IF NOT EXISTS data_penyesuaian (
    id VARCHAR(100) PRIMARY KEY,
    tanggal DATE NOT NULL,
    jenis VARCHAR(50) CHECK (jenis IN ('MASUK', 'KELUAR')),
    sisi_pengaruh VARCHAR(50) CHECK (sisi_pengaruh IN ('BUKU', 'BANK')) DEFAULT 'BUKU',
    uraian TEXT,
    id_sumber_dana VARCHAR(50) REFERENCES master_sumber_dana(id),
    nilai NUMERIC(15, 2) NOT NULL,
    user_pelaksana VARCHAR(100),
    dokumen VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 7. Tabel Setoran Pajak (NTPN)
CREATE TABLE IF NOT EXISTS setoran_pajak (
    id VARCHAR(100) PRIMARY KEY,
    tanggal DATE NOT NULL,
    id_sumber_dana VARCHAR(50) REFERENCES master_sumber_dana(id),
    nomor_bukti VARCHAR(100) UNIQUE NOT NULL, -- NTPN
    uraian TEXT,
    nilai NUMERIC(15, 2) NOT NULL,
    user_pelaksana VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 8. Tabel Saldo Awal (SiLPA)
CREATE TABLE IF NOT EXISTS saldo_awal (
    id VARCHAR(100) PRIMARY KEY,
    tahun INT NOT NULL,
    id_sumber_dana VARCHAR(50) REFERENCES master_sumber_dana(id),
    nilai NUMERIC(15, 2) NOT NULL,
    keterangan TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tahun, id_sumber_dana)
);

-- 9. Tabel Log Aktivitas
CREATE TABLE IF NOT EXISTS log_aktivitas (
    id SERIAL PRIMARY KEY,
    user_pelaksana VARCHAR(100),
    aksi VARCHAR(100),
    detail TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 10. Tabel Pagu OPD
CREATE TABLE IF NOT EXISTS master_pagu (
    id SERIAL PRIMARY KEY,
    tahun INT NOT NULL,
    opd VARCHAR(255) NOT NULL,
    id_sumber_dana VARCHAR(50) REFERENCES master_sumber_dana(id),
    nilai NUMERIC(15, 2) NOT NULL,
    UNIQUE(tahun, opd, id_sumber_dana)
);

-- 11. Insert Data Master Default
INSERT INTO users (username, password_hash, role) 
VALUES ('vigit', '$2b$10$gHccCUc6zruMbxtjg134oeUA5iuvWvsjFHYLLflzGsVpX4nt0Mxmi', 'admin') ON CONFLICT DO NOTHING;

INSERT INTO master_sumber_dana (id, nama, kategori) VALUES 
('SD-PAD', 'PAD - Pendapatan Asli Daerah', 'BEBAS'),
('SD-DAU', 'DAU - Dana Alokasi Umum', 'BEBAS'),
('SD-DAKF', 'DAK Fisik', 'EARMARK'),
('SD-DAKNF', 'DAK Non-Fisik', 'EARMARK'),
('SD-DBH', 'DBH - Dana Bagi Hasil', 'BEBAS'),
('SD-SILPA', 'SiLPA', 'BEBAS'),
('SD-ALL', 'TOTAL APBD (GLOBAL)', 'BEBAS')
ON CONFLICT DO NOTHING;

-- 12. Tabel Data LRA (Historis Bulanan & Tahunan)
CREATE TABLE IF NOT EXISTS data_lra (
    id SERIAL PRIMARY KEY,
    tahun INT NOT NULL,
    bulan INT,
    kode_rekening VARCHAR(50) NOT NULL,
    uraian TEXT NOT NULL,
    anggaran DECIMAL(20, 2) DEFAULT 0,
    realisasi DECIMAL(20, 2) DEFAULT 0,
    keterangan TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_lra_tahun_bulan ON data_lra(tahun, bulan);

-- Indeks lookup ref_bku_id pada bank_statement — dipakai heboh oleh NOT EXISTS
-- ghost-match detection (Section 4 getAnomalies), unmatch, dan deteksi duplikat.
-- Tanpa indeks ini query anomali memakan 60+ detik (seq scan per kandidat).
-- Dibuat Agustus 2026 setelah ditemukan endpoint /anomalies 32-64 detik → 500 intermiten.
CREATE INDEX IF NOT EXISTS idx_bank_ref_bku ON bank_statement(ref_bku_id);

-- Proteksi duplikat rincian potongan SP2D.
-- Mengecualikan AUTO_HEADER (record placeholder agregat dari header SP2D, bukan rincian manual).
-- Dibuat Juni 2026 setelah ditemukan 466 record ganda akibat re-import SIPD dengan tanggal berbeda.
CREATE UNIQUE INDEX IF NOT EXISTS uq_potongan_nomor_uraian_nilai
    ON data_sp2d_potongan (nomor_sp2d, uraian, CAST(nilai AS NUMERIC(20,2)))
    WHERE keterangan IS DISTINCT FROM 'AUTO_HEADER';

-- --- [INVARIANT] Jejak audit penghapusan rincian potongan ---
-- Menjawab kejadian placeholder AUTO_HEADER yang lenyap tanpa pelaku (Agu 2026)
CREATE TABLE IF NOT EXISTS audit_rincian_delete (
  id BIGSERIAL PRIMARY KEY,
  old_id UUID,
  old_id_sp2d VARCHAR,
  old_nomor_sp2d VARCHAR,
  old_uraian TEXT,
  old_nilai NUMERIC(20,2),
  old_keterangan TEXT,
  deleted_at TIMESTAMPTZ DEFAULT now()
);
CREATE OR REPLACE FUNCTION fn_audit_rincian_delete() RETURNS trigger AS $fn$
BEGIN
  INSERT INTO audit_rincian_delete(old_id, old_id_sp2d, old_nomor_sp2d, old_uraian, old_nilai, old_keterangan)
  VALUES (OLD.id, OLD.id_sp2d, OLD.nomor_sp2d, OLD.uraian, OLD.nilai, OLD.keterangan);
  RETURN OLD;
END;
$fn$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_audit_rincian_delete ON data_sp2d_potongan;
CREATE TRIGGER trg_audit_rincian_delete AFTER DELETE ON data_sp2d_potongan
FOR EACH ROW EXECUTE FUNCTION fn_audit_rincian_delete();

-- ═══════════════════════════════════════════════════════════════════
-- MIGRASI Juni 2026 — Status Penyelesaian Potongan Mengendap
-- ═══════════════════════════════════════════════════════════════════
-- Kolom tambahan untuk modul status penyelesaian potongan 'Lainnya'
-- yang tidak memiliki pos pembayaran di rekening koran.
-- Transisi: MENGENDAP → DISETOR atau MENGENDAP → JADI_PADAN
-- Hanya adminOnly yang dapat mengubah status.
ALTER TABLE data_sp2d_potongan ADD COLUMN IF NOT EXISTS status_mengendap VARCHAR(20) NOT NULL DEFAULT 'MENGENDAP';
ALTER TABLE data_sp2d_potongan ADD COLUMN IF NOT EXISTS tanggal_penyelesaian DATE NULL;
ALTER TABLE data_sp2d_potongan ADD COLUMN IF NOT EXISTS catatan_penyelesaian TEXT NULL;
CREATE INDEX IF NOT EXISTS idx_potongan_status_mengendap ON data_sp2d_potongan(status_mengendap);

-- ═══════════════════════════════════════════════════════════════════
-- MIGRASI Agustus 2026 — Modul Koreksi Bank
-- ═══════════════════════════════════════════════════════════════════
-- Surat koreksi dari bank + detail per item koreksi.
-- Menyimpan: nomor surat, tanggal transaksi bank, file bukti,
-- serta link ke bank_statement & penyesuaian yang dibuat.

CREATE TABLE IF NOT EXISTS surat_koreksi_bank (
    id VARCHAR(100) PRIMARY KEY,
    nomor_surat VARCHAR(200) NOT NULL,
    tanggal_surat DATE NOT NULL,
    tanggal_diterima DATE,
    pihak_bank VARCHAR(200),
    keterangan TEXT,
    file_path VARCHAR(500),
    total_nilai NUMERIC(20, 2) DEFAULT 0,
    status VARCHAR(20) DEFAULT 'APPLIED' CHECK (status IN ('DRAFT', 'APPLIED', 'VOID')),
    user_pelaksana VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_surat_koreksi_status ON surat_koreksi_bank(status);

CREATE TABLE IF NOT EXISTS detail_koreksi_bank (
    id VARCHAR(100) PRIMARY KEY,
    id_surat VARCHAR(100) NOT NULL REFERENCES surat_koreksi_bank(id) ON DELETE CASCADE,
    jenis_koreksi VARCHAR(50) NOT NULL CHECK (jenis_koreksi IN (
        'KURANG_TRANSFER',
        'LEBIH_TRANSFER',
        'PEMINDAHBUKUAN_TANPA_SP2D',
        'PENUTUP_SELISIH'
    )),
    nilai NUMERIC(20, 2) NOT NULL,
    uraian TEXT NOT NULL,
    id_sumber_dana VARCHAR(50) REFERENCES master_sumber_dana(id),
    ref_bank_id INTEGER REFERENCES bank_statement(id),
    ref_sp2d_id VARCHAR(100) REFERENCES data_sp2d(id),
    ref_penyesuaian_id VARCHAR(100),
    status VARCHAR(20) DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPLIED')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_detail_koreksi_surat ON detail_koreksi_bank(id_surat);
CREATE INDEX IF NOT EXISTS idx_detail_koreksi_bank_ref ON detail_koreksi_bank(ref_bank_id);

-- Kolom penghubung: penyesuaian yang berasal dari koreksi bank
ALTER TABLE data_penyesuaian ADD COLUMN IF NOT EXISTS ref_koreksi_bank VARCHAR(100);
CREATE INDEX IF NOT EXISTS idx_penyesuaian_koreksi ON data_penyesuaian(ref_koreksi_bank);

-- Indeks pendukung kueri dashboard/realisasi (percepatan getLiquidityHealthScore, Sep 2026)
CREATE INDEX IF NOT EXISTS idx_potongan_id_sp2d ON data_sp2d_potongan(id_sp2d);
CREATE INDEX IF NOT EXISTS idx_detail_sp2d_id_sumber_dana ON detail_sp2d(id_sumber_dana);
CREATE INDEX IF NOT EXISTS idx_pendapatan_id_sumber_dana ON data_pendapatan(id_sumber_dana);
CREATE INDEX IF NOT EXISTS idx_penyesuaian_id_sumber_dana ON data_penyesuaian(id_sumber_dana);

-- === MODUL VERIFIKASI MASAL (Sep 2026) ===
-- Verifikasi massal nomor rekening bank / ID billing pajak pajak (maks 1.000 baris per batch).
-- MODUL TERISOLASI: hanya tabel baru ber-awalan `verification_`; tidak menyentuh tabel rekon.
-- Satu batch = satu jenis (REKENING atau BILLING). API eksternal api.co.id diaktifkan belakangan
-- via env (API_COID_MODE=LIVE); default DRY_RUN menghasilkan respons simulasi untuk pengujian.
CREATE TABLE IF NOT EXISTS verification_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    verification_type VARCHAR(20) NOT NULL CHECK (verification_type IN ('REKENING', 'BILLING')),
    filename VARCHAR(255) NOT NULL,
    created_by UUID REFERENCES users(id),
    total_records INT NOT NULL DEFAULT 0,
    processed INT NOT NULL DEFAULT 0,
    ok_count INT NOT NULL DEFAULT 0,
    fail_count INT NOT NULL DEFAULT 0,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'PARTIAL_FAILED', 'CANCELLED', 'FAILED')),
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    finished_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_verif_batch_type ON verification_batches(verification_type);
CREATE INDEX IF NOT EXISTS idx_verif_batch_status ON verification_batches(status);
CREATE INDEX IF NOT EXISTS idx_verif_batch_created ON verification_batches(created_at DESC);

CREATE TABLE IF NOT EXISTS verification_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id UUID NOT NULL REFERENCES verification_batches(id) ON DELETE CASCADE,
    row_no INT NOT NULL,
    input_account_no VARCHAR(50),
    input_account_name VARCHAR(255),
    input_billing_id VARCHAR(50),
    bank_registered_name VARCHAR(255),
    bank_status VARCHAR(20) DEFAULT 'UNVERIFIED' CHECK (bank_status IN ('UNVERIFIED', 'VALID', 'INVALID', 'NOT_FOUND', 'ERROR')),
    name_match_score DECIMAL(5,2),
    name_match_label VARCHAR(20) CHECK (name_match_label IN ('MATCH', 'PARTIAL', 'MISMATCH', 'UNVERIFIED')),
    tax_status VARCHAR(20) DEFAULT 'UNVERIFIED' CHECK (tax_status IN ('UNVERIFIED', 'ACTIVE', 'EXPIRED', 'INVALID', 'ERROR')),
    tax_type VARCHAR(50),
    tax_type_name VARCHAR(255),
    tax_amount DECIMAL(20,2),
    payer_name VARCHAR(255),
    api_response TEXT,
    validation_message TEXT,
    api_error_message TEXT,
    retry_count INT NOT NULL DEFAULT 0,
    verified_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_verif_items_batch ON verification_items(batch_id);
CREATE INDEX IF NOT EXISTS idx_verif_items_status ON verification_items(batch_id, bank_status);
CREATE INDEX IF NOT EXISTS idx_verif_items_tax_status ON verification_items(batch_id, tax_status);

-- ============================================================
-- Lanjutan modul Verifikasi Masal (September 2026)
-- 1) Batch: tag OPD + Periode (format YYYY-MM). OPD di karena
--    verifikasi LS rutin dikerjakan per OPD per bulan.
-- ============================================================
ALTER TABLE verification_batches ADD COLUMN IF NOT EXISTS opd VARCHAR(255);
ALTER TABLE verification_batches ADD COLUMN IF NOT EXISTS periode VARCHAR(7);
CREATE INDEX IF NOT EXISTS idx_verif_batch_opd ON verification_batches(opd);
CREATE INDEX IF NOT EXISTS idx_verif_batch_periode ON verification_batches(periode);

-- ============================================================
-- 2) Log verifikasi satuan (cek cepat 1 rekening / 1 billing).
--    Kolom berikut = snapshot hasil checkBankAccount/checkBillingId.
-- ============================================================
CREATE TABLE IF NOT EXISTS verification_single_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    verification_type VARCHAR(20) NOT NULL CHECK (verification_type IN ('REKENING', 'BILLING')),
    opd VARCHAR(255),
    periode VARCHAR(7),
    input_account_name VARCHAR(255),
    input_account_no VARCHAR(50),
    input_billing_id VARCHAR(50),
    bank_registered_name VARCHAR(255),
    bank_status VARCHAR(20) CHECK (bank_status IN ('VALID', 'INVALID', 'NOT_FOUND', 'ERROR')),
    name_match_score DECIMAL(5,2),
    name_match_label VARCHAR(20) CHECK (name_match_label IN ('MATCH', 'PARTIAL', 'MISMATCH', 'UNVERIFIED')),
    tax_status VARCHAR(20) CHECK (tax_status IN ('ACTIVE', 'EXPIRED', 'INVALID', 'ERROR')),
    tax_type VARCHAR(50),
    tax_type_name VARCHAR(255),
    tax_amount DECIMAL(20,2),
    payer_name VARCHAR(255),
    api_response TEXT,
    error_message TEXT,
    checked_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_verif_log_type ON verification_single_log(verification_type);
CREATE INDEX IF NOT EXISTS idx_verif_log_opd ON verification_single_log(opd);
CREATE INDEX IF NOT EXISTS idx_verif_log_periode ON verification_single_log(periode);
CREATE INDEX IF NOT EXISTS idx_verif_log_created ON verification_single_log(created_at DESC);
