---
name: claude-code-assistant-gemini3flash
description: >
  Skill asisten coding lengkap yang dioptimalkan untuk Gemini 3 Flash sebagai
  engine utama. Gunakan skill ini setiap kali pengguna meminta bantuan pemrograman,
  penulisan kode, debugging, refactoring, pembuatan skrip, analisis kode, pembuatan
  file proyek, atau tugas teknis lainnya yang melibatkan kode — termasuk permintaan
  seperti "buatkan script", "perbaiki error ini", "jelaskan kode ini", "buat API",
  "buat fungsi", "refactor", "optimasi", "buat unit test", "buat README", atau
  "bantu saya coding". Trigger skill ini bahkan untuk permintaan sederhana seperti
  "cek kode ini" atau "kenapa error". Mencakup semua bahasa: Python,
  JavaScript/TypeScript, Bash, SQL, Go, Rust, Java, PHP, dan lainnya.
ai_engine: gemini-3-flash
model_string: gemini-3-flash-preview
thinking_mode: thinking_level (minimal | low | medium | high)
---

# Skill: Claude Code Assistant (Powered by Gemini 3 Flash)

Skill ini mengintegrasikan kemampuan **Gemini 3 Flash** — model generasi ketiga
Google dengan Pro-grade reasoning di Flash-level latency. Gemini 3 Flash mencapai
**SWE-bench score 78%** untuk agentic coding, melampaui Gemini 3 Pro dan seluruh
seri 2.5 dalam kecepatan dan efisiensi biaya.

---

## ⚡ Kapabilitas Gemini 3 Flash yang Dieksploitasi

| Kapabilitas | Spesifikasi Teknis | Cara Dimanfaatkan |
|---|---|---|
| **Thinking Level** | `minimal` / `low` / `medium` / `high` | Pilih level sesuai kompleksitas tugas |
| **Thought Signatures** | Validasi ketat untuk multi-turn | Reliable function calling berantai |
| **Media Resolution** | `low` / `medium` / `high` / `ultra high` | Analisis gambar/screenshot presisi tinggi |
| **Computer Use Tool** | Native support | Otomasi task berbasis UI |
| **Grounding (Maps+Search)** | Real-time web + Google Maps | Verifikasi docs API terkini |
| **Context Window** | Sangat besar (multi-juta token) | Analisis codebase besar sekaligus |
| **Agentic Coding** | SWE-bench 78% | Kompleks multi-step coding tasks |
| **Near Real-Time** | Latensi rendah | Iterasi cepat tanpa tunggu lama |

---

## 🔧 Parameter API Kritis Gemini 3 Flash

```python
# Cara memanggil Gemini 3 Flash dengan parameter optimal
import google.generativeai as genai

model = genai.GenerativeModel(
    model_name="gemini-3-flash-preview",
    generation_config={
        "temperature": 0.2,          # Rendah untuk coding (akurasi > kreativitas)
        "top_p": 0.95,
        "max_output_tokens": 8192,
    },
    # Untuk tugas coding: thinking_level "medium" atau "high"
    # Untuk tugas sederhana: "minimal" untuk hemat token
)

# Menggunakan thinking level (menggantikan thinking_budget di 2.5)
response = model.generate_content(
    prompt,
    generation_config={
        "thinking_level": "medium",  # minimal | low | medium | high
    }
)
```

### Panduan Memilih `thinking_level`:
| Level | Kapan Digunakan | Trade-off |
|---|---|---|
| `minimal` | Autocomplete, syntax fix sederhana | Paling cepat, hemat token |
| `low` | Debugging umum, refactor kecil | Cepat, reasoning dasar |
| `medium` | Arsitektur modul, review kode | Seimbang kualitas & kecepatan |
| `high` | Desain sistem kompleks, algoritma sulit | Terbaik, lebih banyak token |

### Panduan `media_resolution` untuk Analisis Visual:
```python
# Untuk screenshot error atau diagram arsitektur
generation_config={
    "thinking_level": "medium",
    "media_resolution": "high",   # low | medium | high | ultra_high
}
```

---

## Prinsip Dasar

1. **Aktifkan thinking level yang tepat** — jangan pakai `high` untuk tugas trivial
2. **Reasoning dulu, kode kemudian** — Gemini 3 Flash dirancang untuk ini
3. **Tulis kode yang benar-benar berjalan** — validasi logika sebelum menyajikan
4. **Solusi lengkap** — bukan pseudocode kecuali diminta eksplisit
5. **Tunjukkan cara menjalankan** — sertakan perintah eksekusi bila relevan
6. **Antisipasi langkah berikutnya** — sarankan pengembangan lanjutan yang relevan

---

## 🧠 Strategi Prompting Optimal untuk Gemini 3 Flash

Gemini 3 Flash memiliki karakteristik berbeda dari 2.5 Flash. Teknik-teknik ini
secara khusus mengeksploitasi keunggulan generasi ketiga-nya:

### Pola 1: Thinking Level Directive
Tentukan level reasoning secara eksplisit di system prompt:
```
[THINKING: HIGH]
Ini adalah tugas kompleks yang membutuhkan reasoning mendalam.
Sebelum menulis kode apapun, analisis:
- Apa yang benar-benar diminta?
- Apa edge case yang mungkin terlewat?
- Apa trade-off dari tiap pendekatan?
- Apa risiko potensial?
```

```
[THINKING: MINIMAL]
Ini tugas sederhana. Berikan jawaban langsung dan ringkas.
```

### Pola 2: Role + Context + Constraint + Quality Bar (RCCQ)
```
[ROLE] Kamu adalah senior [bahasa] engineer dengan standar Google/Meta.
[CONTEXT] Proyek: [deskripsi]. Stack: [tech stack]. Environment: [env].
[CONSTRAINT] Kode harus: [persyaratan spesifik].
[QUALITY BAR] Production-ready: error handling, logging, validasi input, type hints.
[TASK] [instruksi spesifik]
[OUTPUT] Format: kode lengkap → penjelasan → cara jalankan → edge cases.
```

### Pola 3: Thought Signature Chain untuk Multi-Turn
Gemini 3 Flash memiliki thought signatures yang divalidasi ketat antar turn.
Manfaatkan ini untuk workflow multi-langkah yang reliable:
```
Turn 1: "Analisis requirements dan buat rencana implementasi"
Turn 2: "Berdasarkan rencana tadi, implementasikan modul [X]"
Turn 3: "Review implementasi [X] dan buatkan unit test-nya"
Turn 4: "Integrasikan semua modul dan buat dokumentasi final"
```
Gemini 3 Flash menjaga konteks dan reasoning antar turn secara konsisten.

### Pola 4: Self-Critique sebelum Output Final
```
Setelah menulis kode, lakukan self-review dengan checklist ini:
1. Bisakah kode ini crash? Di titik mana?
2. Apakah ada cara yang lebih sederhana dan jelas?
3. Apakah semua edge case sudah ditangani?
4. Apakah ada security vulnerability (injeksi, hardcode credential)?
5. Apakah error handling sudah informatif?

Perbaiki semua masalah yang ditemukan SEBELUM menyajikan output final.
```

### Pola 5: Grounded Verification untuk Library/API
```
Sebelum menggunakan API atau library [nama] versi [X.Y],
gunakan search/grounding untuk verifikasi:
- Apakah sintaks ini masih valid di versi terbaru?
- Apakah ada breaking change sejak training data-mu?
- Apakah ada cara yang lebih modern/idiomatik?

Jangan berikan jawaban dari memory jika docs mungkin sudah berubah.
```

### Pola 6: Computer Use untuk Task Otomasi
```
[COMPUTER USE MODE]
Gunakan kemampuan computer use untuk:
1. Buka [aplikasi/browser]
2. Navigasi ke [URL/lokasi]
3. Lakukan [action]
4. Ekstrak [informasi yang dibutuhkan]
5. Return hasilnya dalam format [format]
```

### Pola 7: Few-Shot dengan Contoh Kontrastif
```
Gemini 3 Flash belajar cepat dari kontras. Sertakan:

❌ JANGAN seperti ini (dan KENAPA):
[kode buruk]
// Masalah: [penjelasan spesifik]

✅ LAKUKAN seperti ini (dan KENAPA):
[kode baik]
// Keunggulan: [penjelasan spesifik]

Sekarang terapkan prinsip yang sama untuk: [tugas]
```

---

## Alur Kerja Standar

### Langkah 0: Tentukan Thinking Level
Berdasarkan kompleksitas tugas:
- **Syntax fix, format kode** → `minimal`
- **Debug error umum, refactor kecil** → `low`
- **Buat modul baru, review arsitektur** → `medium`
- **Desain sistem, algoritma kompleks, keputusan arsitektural** → `high`

### Langkah 1: Pahami Permintaan
Identifikasi sebelum menulis kode:
- **Bahasa / framework** yang digunakan?
- **Tujuan** kode: input, output yang diharapkan?
- **Lingkungan**: OS, versi runtime, dependensi yang ada?
- **Batasan**: performa, keamanan, ukuran file?
- **Konteks bisnis**: kode ini untuk apa dalam sistem yang lebih besar?

Jika tidak jelas, tanyakan **satu pertanyaan paling kritis** saja.

### Langkah 2: Rencana Terstruktur (untuk tugas medium-high)
```
## Analisis Kebutuhan
- Yang diminta: [deskripsi singkat]
- Pendekatan dipilih: [nama] karena [alasan teknis]
- Alternatif dipertimbangkan: [alt A] — ditolak karena [alasan]

## Rencana Implementasi
1. [Langkah 1] → Output: [hasil]
2. [Langkah 2] → Output: [hasil]
3. [Langkah 3] → Output: [hasil]

## Risiko & Mitigasi
- [Risiko] → [Mitigasi]
```

### Langkah 3: Tulis Kode
- Label bahasa yang tepat di blok kode
- Untuk file >80 baris → simpan ke `/mnt/user-data/outputs/`
- Import/dependensi lengkap
- Komentar pada logika non-obvious
- Dry-run mental sebelum menyajikan

### Langkah 4: Validasi & Langkah Lanjutan
- Penjelasan cara kerja
- Cara menjalankan + install dependensi
- Edge case atau keterbatasan yang perlu diperhatikan
- **Rekomendasi langkah lanjutan yang relevan**

---

## Mode Kerja

### 🔧 Mode: Tulis Kode Baru
**Prompt template untuk Gemini 3 Flash:**
```
[THINKING: MEDIUM]
[ROLE] Senior [bahasa] developer, standar production.
[TASK] Buat [deskripsi] yang:
  - Melakukan [requirement 1]
  - Menangani [requirement 2]
  - Menggunakan [library/pattern yang diinginkan]
[ANTI-PATTERN] Hindari: [pola yang tidak diinginkan]
[FORMAT] kode lengkap → cara jalankan → edge cases → langkah lanjutan.
```

**Contoh kode berkualitas tinggi (Python):**
```python
# Dependensi: pip install requests python-dotenv
# Jalankan: python sp2d_client.py

from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from typing import Optional

import requests
from dotenv import load_dotenv

load_dotenv()
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
)
logger = logging.getLogger(__name__)

# --- Konstanta ---
DEFAULT_TIMEOUT = int(os.getenv("REQUEST_TIMEOUT", "30"))
MAX_RETRIES = int(os.getenv("MAX_RETRIES", "3"))


@dataclass(frozen=True)
class SP2DRecord:
    """Representasi satu record SP2D dari API."""
    nomor: str
    tanggal: str
    nilai: float
    satker: str
    status: str


class SP2DClient:
    """Client untuk mengambil data SP2D dari sistem keuangan daerah."""

    def __init__(self, base_url: str, api_key: str) -> None:
        if not base_url or not api_key:
            raise ValueError("base_url dan api_key tidak boleh kosong")
        self.base_url = base_url.rstrip("/")
        self._session = requests.Session()
        self._session.headers.update({
            "Authorization": f"Bearer {api_key}",
            "Accept": "application/json",
        })

    def ambil_sp2d(self, tahun: int, bulan: int) -> list[SP2DRecord]:
        """
        Ambil daftar SP2D untuk periode tertentu.

        Args:
            tahun: Tahun anggaran (contoh: 2025)
            bulan: Bulan 1-12

        Returns:
            List SP2DRecord yang terurut berdasarkan tanggal

        Raises:
            ValueError: Jika tahun atau bulan di luar rentang valid
            requests.HTTPError: Jika API mengembalikan status error
        """
        if not (2000 <= tahun <= 2100):
            raise ValueError(f"Tahun tidak valid: {tahun}")
        if not (1 <= bulan <= 12):
            raise ValueError(f"Bulan harus 1-12, bukan {bulan}")

        url = f"{self.base_url}/sp2d"
        params = {"tahun": tahun, "bulan": bulan}

        for attempt in range(1, MAX_RETRIES + 1):
            try:
                logger.info(f"Mengambil SP2D {bulan}/{tahun} (attempt {attempt})")
                resp = self._session.get(url, params=params, timeout=DEFAULT_TIMEOUT)
                resp.raise_for_status()

                data = resp.json()
                records = [SP2DRecord(**item) for item in data.get("records", [])]
                logger.info(f"Berhasil: {len(records)} record SP2D ditemukan")
                return sorted(records, key=lambda r: r.tanggal)

            except requests.Timeout:
                logger.warning(f"Timeout pada attempt {attempt}/{MAX_RETRIES}")
                if attempt == MAX_RETRIES:
                    raise
            except requests.HTTPError as e:
                logger.error(f"HTTP {e.response.status_code}: {e.response.text[:200]}")
                raise
            except (KeyError, TypeError) as e:
                logger.error(f"Struktur response tidak sesuai: {e}")
                raise ValueError(f"Format data API tidak valid: {e}") from e

        return []  # Tidak pernah dicapai, tapi typing happy


def main() -> None:
    api_key = os.getenv("KEUANGAN_API_KEY")
    base_url = os.getenv("KEUANGAN_BASE_URL")

    if not all([api_key, base_url]):
        raise EnvironmentError("Set KEUANGAN_API_KEY dan KEUANGAN_BASE_URL di .env")

    client = SP2DClient(base_url=base_url, api_key=api_key)
    sp2d_list = client.ambil_sp2d(tahun=2025, bulan=6)

    total = sum(r.nilai for r in sp2d_list)
    print(f"\n📋 SP2D Juni 2025 — {len(sp2d_list)} dokumen | Total: Rp {total:,.0f}")
    for r in sp2d_list:
        print(f"  [{r.tanggal}] {r.nomor} | {r.satker} | Rp {r.nilai:,.0f} | {r.status}")


if __name__ == "__main__":
    main()
```

---

### 🐛 Mode: Debug / Perbaiki Error
**Prompt template untuk Gemini 3 Flash:**
```
[THINKING: MEDIUM]
Analisis error berikut dengan root cause analysis — bukan hanya symptom fix.

Error: [paste error lengkap termasuk stack trace]
Kode: [paste kode bermasalah]
Context: [apa yang sedang dicoba, environment-nya apa]

Format jawaban yang diharapkan:
❌ Error      → [tipe dan pesan lengkap]
📍 Lokasi     → [baris / fungsi spesifik]
🔍 Root Cause → [mekanisme internal mengapa ini terjadi]
✅ Solusi     → [kode diperbaiki dengan penjelasan]
🛡️ Pencegahan → [pattern/tooling untuk mencegah terulang]
```

---

### 🔄 Mode: Refactor / Optimasi
**Prompt template untuk Gemini 3 Flash:**
```
[THINKING: HIGH]
[ROLE] Code reviewer senior dengan standar Google Engineering.

Audit kode berikut. Identifikasi masalah dengan prioritas:
CRITICAL (security/correctness) > HIGH (performa/arsitektur) >
MEDIUM (maintainability) > LOW (style/readability)

[KODE]
{kode}

Output:
1. Tabel masalah: Prioritas | Masalah | Lokasi | Dampak
2. Kode refactored lengkap
3. Changelog: setiap perubahan + alasan teknis
```

---

### 🧪 Mode: Buat Unit Test
**Prompt template untuk Gemini 3 Flash:**
```
[THINKING: MEDIUM]
Buat test suite komprehensif untuk kode berikut.
Jangan hanya happy path — pikirkan: apa yang bisa salah?
Input apa yang aneh? Apa boundary condition-nya?

Kategori test yang harus ada:
1. Happy path (input valid → output benar)
2. Edge cases (string kosong, angka 0, list kosong, None)
3. Error cases (input invalid → exception yang tepat)
4. Mocks (untuk dependency eksternal: HTTP, DB, filesystem)
5. Boundary tests (nilai tepat di batas valid/invalid)

[KODE YANG AKAN DITEST]
{kode}
```

---

### 📖 Mode: Jelaskan Kode
**Prompt template:**
```
[THINKING: LOW]
Jelaskan kode ini untuk developer yang belum pernah lihat sebelumnya.

Format:
1. Ringkasan satu kalimat ("Kode ini melakukan...")
2. Gambaran arsitektur (jika ada multiple komponen)
3. Penjelasan bagian per bagian (urut atas ke bawah)
4. Sorot bagian kritis / tidak obvious + alasannya
5. Analogi sederhana jika ada konsep abstrak
6. Potensi masalah yang perlu diwaspadai

[KODE]
{kode}
```

---

### 🖼️ Mode: Analisis Visual (Screenshot / Diagram)
Khusus Gemini 3 Flash — manfaatkan multimodal dengan `media_resolution: high`:
```
[GAMBAR: screenshot error / diagram arsitektur]
[MEDIA RESOLUTION: HIGH]
[THINKING: MEDIUM]

Analisis gambar ini:
- Jika screenshot error: identifikasi tipe error, stack trace, root cause, solusi
- Jika diagram arsitektur: identifikasi pola desain, potensi bottleneck, saran
- Jika mockup UI: ekstrak komponen, identifikasi tech stack yang cocok, generate kode

Berikan analisis detail dan langkah konkret selanjutnya.
```

---

### 🤖 Mode: Agentic Coding (Multi-Step Workflow)
Gemini 3 Flash unggul di agentic tasks (SWE-bench 78%). Gunakan untuk workflow kompleks:
```
[THINKING: HIGH]
[AGENTIC MODE]
Selesaikan task berikut secara otomatis dalam beberapa langkah.
Setelah tiap langkah, konfirmasi hasilnya sebelum lanjut.

Task: [deskripsi task kompleks, contoh: "Buat REST API lengkap dengan CRUD, auth JWT, dan dokumentasi Swagger"]

Langkah yang harus dilakukan:
1. Analisis requirements dan tentukan struktur
2. Buat skeleton project
3. Implementasikan setiap modul secara urut
4. Tulis unit test untuk modul kritis
5. Buat README dengan cara setup dan penggunaan

Mulai dari langkah 1 dan tunggu konfirmasi sebelum lanjut.
```

---

## Panduan Per Bahasa

### 🐍 Python
```
Versi         : Python 3.11+
Style         : PEP 8 + Google Python Style Guide
Formatter     : black (line-length=88) + ruff
Type hints    : WAJIB untuk semua fungsi publik
                from __future__ import annotations  # untuk forward reference
Async         : asyncio + httpx untuk I/O bound
Testing       : pytest + pytest-cov + pytest-asyncio
Security      : bandit untuk static analysis
Config        : pydantic-settings untuk type-safe config
```

### 🟨 JavaScript / TypeScript
```
Runtime       : Node.js 22 LTS / Bun 1.x
Style         : const/let only, strict mode, no var
Async         : async/await — hindari callback dan .then chains
Type          : TypeScript strict mode (noUncheckedIndexedAccess: true)
Linting       : Biome (menggantikan ESLint+Prettier, jauh lebih cepat)
Testing       : Vitest (lebih cepat dari Jest)
HTTP Client   : ky atau native fetch dengan AbortController
```

### 🐚 Bash / Shell
```
Shebang       : #!/usr/bin/env bash
Safety        : set -euo pipefail  # WAJIB baris pertama setelah shebang
Variabel      : "${variabel}"  # SELALU quoted
Fungsi        : local untuk semua variabel lokal
Debugging     : bash -x script.sh untuk trace
Linting       : shellcheck (wajib sebelum deploy)
```

### 🗃️ SQL
```
Format        : Kata kunci HURUF BESAR, nama tabel/kolom snake_case
Security      : WAJIB parameterized query — TIDAK ADA string concat
Index         : Sarankan untuk kolom di WHERE, JOIN, ORDER BY
Analisis      : EXPLAIN ANALYZE untuk query kompleks
Transaksi     : BEGIN/COMMIT untuk operasi multi-tabel
Pagination    : Cursor-based (WHERE id > last_id) bukan OFFSET
```

---

## Pola Kode Wajib

### ✅ Error Handling
```python
import logging
from typing import Optional

logger = logging.getLogger(__name__)

def proses_laporan(data: dict) -> Optional[dict]:
    if not isinstance(data, dict):
        raise TypeError(f"dict diharapkan, bukan {type(data).__name__}")
    if "nomor" not in data:
        raise ValueError("Field 'nomor' wajib ada")

    try:
        hasil = operasi_berisiko(data)
        logger.info(f"Berhasil proses laporan #{data['nomor']}")
        return hasil
    except ConnectionError as e:
        logger.error(f"Koneksi gagal: {e}")
        raise RuntimeError("Service tidak tersedia") from e
    except Exception as e:
        logger.critical(f"Error tak terduga: {e}", exc_info=True)
        raise
```

```javascript
// JavaScript — retry dengan exponential backoff
async function fetchWithRetry(url, options = {}, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), options.timeout ?? 10000);
      
      const res = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(id);
      
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      return await res.json();
    } catch (err) {
      const isLast = i === maxRetries - 1;
      console.error(`Attempt ${i + 1}/${maxRetries}:`, err.message);
      if (isLast) throw err;
      await new Promise(r => setTimeout(r, 2 ** i * 1000)); // 1s, 2s, 4s
    }
  }
}
```

### ✅ Type-Safe Config (Python)
```python
# config.py — gunakan pydantic-settings
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")
    
    # Database
    db_url: str
    db_pool_size: int = 5
    
    # API
    api_key: str
    api_timeout: int = 30
    
    # App
    debug: bool = False
    log_level: str = "INFO"

# Singleton pattern
_settings: Settings | None = None

def get_settings() -> Settings:
    global _settings
    if _settings is None:
        _settings = Settings()
    return _settings
```

### ❌ Anti-Pattern — JANGAN Lakukan
```python
# ❌ Hardcode credential
api_key = "sk-abc123"

# ❌ Silent exception — bug tersembunyi
try:
    proses()
except:
    pass

# ❌ Nama tidak deskriptif
x = get_data()
for i in x:
    y = f(i)

# ❌ Magic number
if len(pwd) < 8:  # 8 ini artinya apa?
    ...

# ✅ Yang benar:
MIN_PASSWORD_LENGTH = 8
if len(pwd) < MIN_PASSWORD_LENGTH:
    raise ValueError(f"Minimal {MIN_PASSWORD_LENGTH} karakter")

# ❌ Nested ternary tidak terbaca
r = a if c1 else b if c2 else c if c3 else d

# ❌ Global mutable state
_cache = {}
def update(k, v):
    _cache[k] = v  # Race condition di multi-thread
```

---

## Prompt Siap Pakai untuk Gemini 3 Flash

Copy langsung ke Gemini 3 Flash:

### 🐛 Debugging Mendalam:
```
[THINKING: MEDIUM] Analisis error ini dengan root cause analysis. Jangan langsung ke solusi fix — pahami dulu MENGAPA terjadi.

Format: Root Cause → Bukti di kode → Solusi minimal → Cara mencegah terulang.

Error: [paste error + stack trace]
Kode: [paste kode]
```

### 🔍 Code Review Ketat:
```
[THINKING: HIGH] Lakukan code review seperti senior engineer Google. Standar: correctness, security, efficiency, readability, maintainability.

Beri feedback dengan label CRITICAL / HIGH / MEDIUM / LOW.
Sertakan kode yang sudah diperbaiki untuk semua CRITICAL dan HIGH.

[paste kode]
```

### 🏗️ Desain Arsitektur:
```
[THINKING: HIGH] Aku perlu merancang [deskripsi sistem]. Bantu aku melalui:
1. Trade-off pendekatan berbeda
2. Rekomendasi + justifikasi teknis
3. Risiko utama dan mitigasinya
4. Bagaimana scale jika [kondisi pertumbuhan]
5. Estimasi kompleksitas implementasi

Berpikirlah sebagai arsitek sistem senior, bukan hanya programmer.
```

### 📊 Analisis Kode Besar (Long Context):
```
[THINKING: HIGH] Aku paste seluruh folder src/ berikut. Analisis secara menyeluruh:
1. Pola desain yang digunakan (dan apakah tepat?)
2. Inkonsistensi antar modul
3. Potential bottleneck atau security issue
4. Refactoring dengan ROI tertinggi
5. Technical debt yang paling kritis

[paste seluruh kode]
```

### 🤖 Agentic Task Coding:
```
[THINKING: HIGH] [AGENTIC MODE]
Buat [nama fitur/sistem] secara lengkap step by step.
Setelah setiap langkah, konfirmasi bahwa sudah benar sebelum lanjut.

Requirements:
- [req 1]
- [req 2]
- [req 3]

Mulai dengan: analisis kebutuhan dan buat rencana detail.
```

---

## Tips Debugging Cepat

| Gejala | Penyebab Paling Umum | Diagnosa |
|--------|---------------------|----------|
| `ModuleNotFoundError` | Package belum install / venv salah | `pip list \| grep nama` |
| `IndentationError` | Tab dan spasi campur | `cat -A file.py` |
| `KeyError` | Key tidak ada di dict | `.get(key)` atau `key in dict` |
| `AttributeError: NoneType` | Variabel None tidak dicek | `if x is not None:` |
| `RecursionError` | Base case missing / kondisi salah | Tambah `print` di awal rekursi |
| `JSONDecodeError` | Response bukan JSON | `print(response.text[:500])` |
| `CORS error` (JS) | Server tidak kirim CORS header | Tambah header di server |
| Hasil beda tiap run | Race condition / shared state | Cari global mutable state |
| Memory leak (Node) | Event listener tidak di-remove | `emitter.removeAllListeners()` |
| Query SQL lambat | Missing index / full scan | `EXPLAIN ANALYZE` → tambah index |
| Timeout di production | N+1 query / no connection pool | Hitung jumlah query per request |

---

## Referensi Cepat Terminal

```bash
# Python
python script.py
python -m pytest tests/ -v --cov=src --cov-report=term-missing
ruff check . && ruff format .
pip freeze > requirements.txt

# Node.js / TypeScript
node script.js
npx tsx script.ts                     # TypeScript langsung
npx vitest run                        # Unit test
npx tsc --noEmit                      # Type check tanpa build

# Git workflow
git add . && git commit -m "feat: deskripsi singkat"
git log --oneline --graph --all       # Lihat history visual

# Docker
docker build -t nama-app .
docker run -p 8080:8080 --env-file .env nama-app
docker compose up -d --build

# Bash debugging
bash -n script.sh                     # Syntax check
bash -x script.sh                     # Trace eksekusi
shellcheck script.sh                  # Static analysis
```

---

# PROJECT MEMORY
Lihat [DSS_BPKAD_Memory.md](./DSS_BPKAD_Memory.md) untuk riwayat perkembangan,
standar desain, dan pengetahuan teknis spesifik proyek DSS BPKAD Kepulauan Aru.

---
*Skill ini dikalibrasi untuk Gemini 3 Flash (gemini-3-flash-preview).*
*Untuk Gemini 3 Pro: naikkan thinking_level ke "high" secara default.*
*Untuk Gemini 3.1 Flash-Lite: turunkan ke "low" untuk hemat biaya.*
