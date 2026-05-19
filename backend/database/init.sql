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
VALUES ('vigit', '$2b$10$k7viweh.0GpMDCUC//AzHOMwgtiyP1wSgEd2J0vrPLudJgd6Lde0m', 'admin') ON CONFLICT DO NOTHING;

INSERT INTO master_sumber_dana (id, nama, kategori) VALUES 
('SD-PAD', 'PAD - Pendapatan Asli Daerah', 'BEBAS'),
('SD-DAU', 'DAU - Dana Alokasi Umum', 'BEBAS'),
('SD-DAKF', 'DAK Fisik', 'EARMARK'),
('SD-DAKNF', 'DAK Non-Fisik', 'EARMARK'),
('SD-DBH', 'DBH - Dana Bagi Hasil', 'BEBAS'),
('SD-SILPA', 'SiLPA', 'BEBAS'),
('SD-ALL', 'TOTAL APBD (GLOBAL)', 'BEBAS')
ON CONFLICT DO NOTHING;
