const db = require('../config/db');

const createTables = async () => {
    const queryText = `
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

        -- 2. Tabel Kas Masuk
        CREATE TABLE IF NOT EXISTS data_pendapatan (
            id VARCHAR(100) PRIMARY KEY,
            tanggal DATE NOT NULL,
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
            opd VARCHAR(255) NOT NULL,
            jenis VARCHAR(50) NOT NULL,
            uraian TEXT,
            penerima VARCHAR(255) NOT NULL,
            nilai_bruto NUMERIC(15, 2) NOT NULL,
            nilai_potongan NUMERIC(15, 2) DEFAULT 0,
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
            id_sumber_asli VARCHAR(50) REFERENCES master_sumber_dana(id),
            id_sumber_talangan VARCHAR(50) REFERENCES master_sumber_dana(id),
            nilai NUMERIC(15, 2) NOT NULL,
            status VARCHAR(50) CHECK (status IN ('BELUM', 'SELESAI')) DEFAULT 'BELUM',
            tanggal_selesai TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        
        -- 6. Insert Data Master Default (Admin & Sumber Dana Utama)
        INSERT INTO users (username, password_hash, role) 
        VALUES ('admin', '$2b$10$qRjBHF/M5aajMCfRIqNzA.mbeRna5t3RqoqXaSp0s3f.YakXZ/SkC', 'admin') ON CONFLICT DO NOTHING;

        INSERT INTO master_sumber_dana (id, nama, kategori) VALUES 
        ('SD-PAD', 'PAD - Pendapatan Asli Daerah', 'BEBAS'),
        ('SD-DAU', 'DAU - Dana Alokasi Umum', 'BEBAS'),
        ('SD-DAKF', 'DAK Fisik', 'EARMARK'),
        ('SD-DAKNF', 'DAK Non-Fisik', 'EARMARK')
        ON CONFLICT DO NOTHING;
    `;

    try {
        console.log('⏳ Memulai pembuatan struktur tabel di PostgreSQL...');
        await db.query(queryText);
        console.log('✅ Semua tabel berhasil dibuat beserta data default!');
    } catch (error) {
        console.error('❌ Gagal membuat tabel:', error.message);
    } finally {
        process.exit();
    }
};

createTables();
