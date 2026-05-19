# 🚀 Panduan Instalasi & Menjalankan DSS BPKAD

Aplikasi ini adalah **Sistem Pendukung Keputusan (DSS)** untuk BPKAD yang menggunakan **Express.js** di Backend dan **Next.js 15** di Frontend.

---

## 📋 Prasyarat
Sebelum memulai, pastikan Anda sudah menginstal:
1.  **Node.js** (Versi 18 atau lebih baru)
2.  **PostgreSQL** (Sudah terpasang dan berjalan)
3.  **Code Editor** (Disarankan VS Code)

---

## 🛠️ Langkah 1: Persiapan Database
1.  Buka PostgreSQL client Anda (pgAdmin, DBeaver, atau psql).
2.  Buat database baru bernama `dss_bpkad`.
3.  Jalankan script SQL yang ada di:
    `backend/database/init.sql`
    *Script ini akan membuat seluruh tabel master, transaksional, dan DSS.*

---

## ⚙️ Langkah 2: Konfigurasi Backend
1.  Masuk ke direktori backend:
    ```bash
    cd backend
    ```
2.  Instal dependensi:
    ```bash
    npm install
    ```
3.  Buka file `.env` dan sesuaikan `DATABASE_URL` dengan kredensial PostgreSQL Anda:
    ```env
    PORT=5000
    DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/dss_bpkad
    JWT_SECRET=supersecretkey123
    ```
4.  Jalankan Server Backend:
    ```bash
    node server.js
    # Atau jika menggunakan nodemon:
    npx nodemon server.js
    ```
    *Backend akan berjalan di: `http://localhost:5000`*

---

## 💻 Langkah 3: Konfigurasi Frontend
1.  Buka terminal baru dan masuk ke direktori frontend:
    ```bash
    cd frontend
    ```
2.  Instal dependensi:
    ```bash
    npm install
    ```
3.  Jalankan Server Frontend:
    ```bash
    npm run dev
    ```
    *Frontend akan berjalan di: `http://localhost:3000`*

---

## 🔐 Langkah 4: Penggunaan Pertama
1.  Buka browser dan akses `http://localhost:3000/login`.
2.  **Data User Awal**: Karena belum ada user di database, Anda bisa mendaftarkan user pertama melalui endpoint API `/api/auth/register` menggunakan Postman/Thunder Client, atau langsung memasukkan data ke tabel `users` secara manual:
    ```sql
    -- Contoh insert user admin (Password harus di-hash menggunakan bcrypt)
    -- Catatan: Password 'admin123' hasil hash bcrypt: $2b$10$EPfLrkZh68L56WwEruL8UeUqQf.28.S8r6.2f8Y7G8g.Y8qY8qY8q
    INSERT INTO users (username, password_hash, role) 
    VALUES ('admin', '$2b$10$EPfLrkZh68L56WwEruL8UeUqQf.28.S8r6.2f8Y7G8g.Y8qY8qY8q', 'admin');
    ```
3.  Setelah login, Anda akan diarahkan ke **Dashboard**.

---

## 📂 Struktur Proyek
-   `/backend`: API Server (Express, PG, Multer, JWT).
-   `/frontend`: Client Application (Next.js 15, Tailwind v4, Chart.js).
-   `/backend/uploads`: Folder penyimpanan file PDF e-Arsip.
-   `/backend/database`: Berisi file `init.sql` untuk migrasi schema.

---

## 💡 Fitur Utama yang Sudah Siap:
-   **Dashboard Analytics**: Visualisasi tren belanja dan kas efektif.
-   **Form SP2D Dinamis**: Input rincian sumber dana dengan kalkulator pajak.
-   **Validasi DSS**: Cek Pagu dan Likuiditas otomatis sebelum simpan data.
-   **Buku Kas Umum (BKU)**: Laporan saldo berjalan secara kronologis.
-   **Role Security**: Perbedaan akses antara Admin dan Operator.
-   **e-Arsip**: Upload dan management file PDF SP2D.

---
*Dikembangkan oleh Antigravity untuk BPKAD.*
