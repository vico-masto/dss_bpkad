-- ============================================================
-- TRIGGER: Proteksi tanggal_pencairan dari penghapusan
-- Dibuat: 2026-05-19
-- Latar belakang: insiden Mei 2026 — Reset Rekon menghapus seluruh
--   tanggal_pencairan dari data_sp2d tanpa sengaja.
--
-- ATURAN: tanggal_pencairan TIDAK BOLEH di-NULL-kan pada record yang
--   sudah memiliki nilai, dalam kondisi apapun — kecuali record di-DELETE.
--
-- Cara apply: psql -U postgres -d <nama_db> -f trigger_protect_tanggal_pencairan.sql
-- ============================================================

-- 1. Fungsi trigger untuk data_sp2d
CREATE OR REPLACE FUNCTION fn_protect_tanggal_pencairan_sp2d()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.tanggal_pencairan IS NOT NULL AND NEW.tanggal_pencairan IS NULL THEN
    RAISE EXCEPTION
      'PROTEKSI DATA KRITIS: tanggal_pencairan pada SP2D "%" (id=%) tidak boleh dihapus. '
      'Nilai saat ini: %. Aturan: field ini hanya boleh dihapus bersama DELETE record.',
      OLD.nomor, OLD.id, OLD.tanggal_pencairan;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Pasang trigger ke tabel data_sp2d
DROP TRIGGER IF EXISTS trg_protect_tanggal_pencairan_sp2d ON data_sp2d;
CREATE TRIGGER trg_protect_tanggal_pencairan_sp2d
  BEFORE UPDATE ON data_sp2d
  FOR EACH ROW
  EXECUTE FUNCTION fn_protect_tanggal_pencairan_sp2d();

-- 3. Fungsi trigger untuk data_sp2d_potongan (tanggal_pencairan juga kritis di sini)
CREATE OR REPLACE FUNCTION fn_protect_tanggal_pencairan_potongan()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.tanggal_pencairan IS NOT NULL AND NEW.tanggal_pencairan IS NULL THEN
    RAISE EXCEPTION
      'PROTEKSI DATA KRITIS: tanggal_pencairan pada potongan SP2D "%" (id=%) tidak boleh dihapus. '
      'Nilai saat ini: %.',
      OLD.nomor_sp2d, OLD.id, OLD.tanggal_pencairan;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. Pasang trigger ke tabel data_sp2d_potongan
DROP TRIGGER IF EXISTS trg_protect_tanggal_pencairan_potongan ON data_sp2d_potongan;
CREATE TRIGGER trg_protect_tanggal_pencairan_potongan
  BEFORE UPDATE ON data_sp2d_potongan
  FOR EACH ROW
  EXECUTE FUNCTION fn_protect_tanggal_pencairan_potongan();

-- ============================================================
-- Verifikasi: trigger aktif
-- ============================================================
SELECT
  trigger_name,
  event_object_table,
  event_manipulation,
  action_timing
FROM information_schema.triggers
WHERE trigger_name IN (
  'trg_protect_tanggal_pencairan_sp2d',
  'trg_protect_tanggal_pencairan_potongan'
)
ORDER BY event_object_table;
