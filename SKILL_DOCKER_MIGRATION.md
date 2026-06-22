---
name: nodejs-docker-migration
description: >-
  Migrasi aplikasi full-stack Node.js (Express + Next.js + PostgreSQL/PostGIS) dari
  mode manual/WSL ke Docker Compose. Mencakup pola DSS BPKAD dan SIMDA BMD: Dockerfile,
  docker-compose.yml, fix SSR routing, Prisma schema validation, volume management,
  .dockerignore, dan Windows launcher BAT. Gunakan skill ini saat ingin containerize
  aplikasi Node/Next berbasis PostgreSQL di lingkungan Windows dengan Docker Desktop.
version: 1.0.0
author: Claude Code (dari pengalaman DSS BPKAD + SIMDA BMD)
tags: [docker, nodejs, nextjs, express, postgresql, postgis, prisma, windows, migration, compose]
---

# Skill: Node.js Full-Stack → Docker Compose Migration

Skill ini mendokumentasikan semua langkah, pola, dan jebakan dari dua migrasi nyata:
- **DSS BPKAD** — Express 5 + Next.js 16 + PostgreSQL 16 (port 5000 / 3000)
- **SIMDA BMD** — Express 5 + Next.js 16 + PostGIS 16 + Prisma (port 5003 / 3002)

---

## Arsitektur Target

```
┌─────────────────── docker-compose.yml ──────────────────┐
│                                                          │
│  ┌──────────────┐    ┌──────────────┐    ┌───────────┐  │
│  │  postgres    │◄───│   backend    │◄───│ frontend  │  │
│  │  :5432       │    │  Express 5   │    │  Next.js  │  │
│  │  (internal)  │    │  :5003       │    │  :3002    │  │
│  │  :5433(host) │    │  :5003(host) │    │  :3002    │  │
│  └──────────────┘    └──────────────┘    └───────────┘  │
│                                                          │
│  Browser → localhost:3002 (frontend)                     │
│  SSR/RSC  → bmd-backend:5003 (via Docker network)        │
│  Browser API → localhost:5003 (via host port mapping)    │
└──────────────────────────────────────────────────────────┘
```

---

## Langkah 1 — Periksa State Awal

```powershell
# Lihat container yang sedang jalan / berhenti
docker ps -a --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

# Cek volume yang sudah ada (database mungkin sudah berisi data!)
docker volume ls

# Jika postgres container lama ada, cek kredensialnya
docker inspect <nama-postgres-lama> --format "{{json .Config.Env}}" | ConvertFrom-Json

# Cek port binding container lama
docker inspect <nama-postgres-lama> --format "{{json .HostConfig.PortBindings}}"
```

**PENTING:** Jika volume postgres sudah ada dengan data, jangan dihapus.
Gunakan `external: true` di docker-compose.yml.

---

## Langkah 2 — Struktur File yang Dibuat

```
project-root/
├── docker-compose.yml          ← BARU
├── start-app.bat               ← UPDATE (ganti dari WSL launcher)
├── backend/
│   ├── Dockerfile              ← BARU
│   ├── .dockerignore           ← BARU
│   └── ... (kode yang ada)
└── frontend/
    ├── Dockerfile              ← BARU
    ├── .dockerignore           ← BARU
    ├── next.config.ts          ← UPDATE (rewrite destination)
    └── lib/api.ts              ← UPDATE (SSR routing fix)
```

---

## Langkah 3 — docker-compose.yml

```yaml
services:
  postgres:
    image: postgis/postgis:16-3.4      # atau postgres:16-alpine jika tidak butuh PostGIS
    container_name: <app>-postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: <db_user>
      POSTGRES_PASSWORD: <db_password>
      POSTGRES_DB: <db_name>
    ports:
      - "5433:5432"   # host:container — pakai 5433 agar tidak konflik jika DSS juga jalan
    volumes:
      - <app>-postgres-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U <db_user> -d <db_name>"]
      interval: 5s
      timeout: 5s
      retries: 10

  backend:
    build:
      context: ./backend            # atau ./bmd-backend
      dockerfile: Dockerfile
    container_name: <app>-backend
    restart: unless-stopped
    environment:
      PORT: "5003"
      # ⚠️ WAJIB: gunakan nama service (bukan IP hardcode!)
      DATABASE_URL: postgresql://<user>:<pass>@postgres:5432/<db>
      JWT_SECRET: <secret>
      FRONTEND_URL: http://localhost:3002   # untuk CORS di backend
    ports:
      - "5003:5003"
    depends_on:
      postgres:
        condition: service_healthy
    volumes:
      - ./backend/public/uploads:/app/public/uploads   # jika ada file upload

  frontend:
    build:
      context: ./frontend           # atau ./bmd-frontend
      dockerfile: Dockerfile
    container_name: <app>-frontend
    restart: unless-stopped
    environment:
      NEXT_PUBLIC_API_URL: http://localhost:5003       # untuk browser (client-side)
      NEXT_PUBLIC_APP_NAME: <nama app>
      JWT_SECRET: <secret>
      # ⚠️ WAJIB: URL internal Docker untuk SSR/RSC
      BACKEND_URL: http://<app>-backend:5003
    ports:
      - "3002:3002"
    depends_on:
      - backend

volumes:
  <app>-postgres-data:
    external: true    # jika volume sudah ada dengan data
    # external: false # atau hapus baris ini jika volume baru
```

**Catatan Port:**
- DSS BPKAD: Backend `:5000`, Frontend `:3000`, Postgres `:5432` (host)
- SIMDA BMD: Backend `:5003`, Frontend `:3002`, Postgres `:5433` (host)

---

## Langkah 4 — Dockerfile Backend (Express + Prisma)

```dockerfile
FROM node:20-slim

WORKDIR /app

# openssl dibutuhkan oleh Prisma; curl untuk healthcheck
RUN apt-get update && apt-get install -y openssl curl && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci

COPY . .
RUN npx prisma generate

EXPOSE 5003
CMD ["node", "--max-old-space-size=768", "index.js"]
```

**Jika tidak pakai Prisma (seperti DSS BPKAD yang pakai pg langsung):**
```dockerfile
FROM node:20-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

EXPOSE 5000
CMD ["node", "server.js"]
```

### backend/.dockerignore
```
node_modules
.env
*.log
generated/
```

---

## Langkah 5 — Dockerfile Frontend (Next.js)

```dockerfile
FROM node:20-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

EXPOSE 3002
CMD ["npm", "run", "dev"]
```

**Catatan:** Pakai `npm run dev` (bukan `build + start`) untuk konsistensi dengan
DSS BPKAD dan karena lebih cepat restart tanpa build step.

### frontend/.dockerignore
```
node_modules
.next
.env.local
*.log
```

---

## Langkah 6 — FIX KRITIS: SSR Routing di Docker

### Masalah
Next.js berjalan di dua konteks:
- **Browser (client-side):** `localhost:5003` → benar, karena port di-expose ke host
- **Server-side (SSR/RSC):** `localhost:5003` → **SALAH**, karena `localhost` di dalam container frontend = container itu sendiri (tidak ada port 5003 di sana)

### Gejala
```
Dashboard fetch error: TypeError: fetch failed
  [cause]: Error: connect ECONNREFUSED 127.0.0.1:5003
```

### Fix di `lib/api.ts`

```typescript
// SEBELUM (rusak di Docker):
const API_URL = process.env.NEXT_PUBLIC_API_URL 
  || (typeof window === 'undefined' ? 'http://localhost:5003' : '');

// SESUDAH (benar):
const API_URL = typeof window === 'undefined'
  ? (process.env.BACKEND_URL || 'http://localhost:5003')       // server-side → Docker internal
  : (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5003'); // browser → localhost
```

**Prinsipnya:**
- `typeof window === 'undefined'` → kode berjalan di server Next.js (SSR) → pakai `BACKEND_URL`
- `typeof window !== 'undefined'` → kode berjalan di browser → pakai `NEXT_PUBLIC_API_URL`

### Fix di `next.config.ts` (rewrites)

```typescript
// SEBELUM:
destination: 'http://localhost:5003/api/:path*'

// SESUDAH:
async rewrites() {
  const backendUrl = process.env.BACKEND_URL || 'http://localhost:5003';
  return [
    {
      source: '/api/:path*',
      destination: `${backendUrl}/api/:path*`,
    },
  ];
},
```

---

## Langkah 7 — Fix Prisma Schema (Jika Pakai Prisma)

### Masalah Umum 1: Model direferensikan tapi tidak didefinisikan
```
Error: Type "TaPengadaanSp2d" is neither a built-in type, nor refers to another model
```
**Penyebab:** Ada relasi di schema ke model yang belum ditulis.
**Fix:** Tambah model yang hilang berdasarkan `init.sql` / skema database aktual.

```prisma
/// Contoh model yang hilang — sesuaikan dengan tabel DB
model TaPengadaanSp2d {
  id          String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  pengadaanId String    @map("pengadaan_id") @db.Uuid
  noSp2d      String?   @map("no_sp2d") @db.VarChar(100)
  tglSp2d     DateTime? @map("tgl_sp2d") @db.Date
  nilai       Decimal   @default(0) @db.Decimal(20, 2)
  createdAt   DateTime  @default(now()) @map("created_at") @db.Timestamptz
  updatedAt   DateTime  @updatedAt @map("updated_at") @db.Timestamptz

  taPengadaan TaPengadaan @relation(fields: [pengadaanId], references: [id], onDelete: Cascade)
  @@map("ta_pengadaan_sp2d")
}
```

### Masalah Umum 2: Relasi tidak memiliki inverse
```
Error: The relation field `refUnit` on model `TaKibA` is missing an opposite relation
field on the model `RefUnit`.
```
**Penyebab:** Model anak punya `@relation` ke parent, tapi parent tidak punya array field balik.
**Fix:** Tambahkan inverse relation di model parent.

```prisma
model RefUnit {
  // ...field yang ada...
  subUnit RefSubUnit[]
  users   Users[]
  // Tambah ini — satu baris per child model yang merefer RefUnit:
  kibA    TaKibA[]
  kibB    TaKibB[]
  @@map("ref_unit")
}
```

**Cara temukan semua yang perlu di-fix:**
```bash
# Cari semua @relation yang pakai field tertentu (misal kdUnit)
grep -n "RefUnit.*@relation" prisma/schema.prisma

# Lalu cek apakah RefUnit model sudah punya inverse untuk semua itu
grep -n "model RefUnit" -A 20 prisma/schema.prisma
```

---

## Langkah 8 — Windows Launcher BAT (Docker Compose)

```batch
@echo off
TITLE <App> — Docker Launcher
SETLOCAL EnableDelayedExpansion
COLOR 0B

set "ARG=%1"

:: STOP
if /i "%ARG%"=="stop" (
    docker compose down
    pause & exit /b
)

:: Cek Docker
docker info >nul 2>&1
if errorlevel 1 (
    echo [X] Docker tidak berjalan! Buka Docker Desktop.
    pause & exit /b
)

:: Build jika diminta
if /i "%ARG%"=="build" (
    docker compose build
    if errorlevel 1 ( echo [X] Build gagal! & pause & exit /b )
)

:: Start
docker compose up -d
if errorlevel 1 ( echo [X] Gagal start! & pause & exit /b )

:: Tunggu & health check
echo Menunggu service siap...
for /l %%i in (1,1,18) do (
    timeout /t 5 /nobreak >nul
    set "BE="; set "FE="
    docker exec <app>-backend curl -sf http://localhost:5003/health >nul 2>&1
    if not errorlevel 1 set "BE=1"
    docker exec <app>-frontend curl -sf http://localhost:3002/ >nul 2>&1
    if not errorlevel 1 set "FE=1"
    if defined BE if defined FE goto :UP
    if defined BE (echo [OK] Backend) else (echo [...] Backend...)
    if defined FE (echo [OK] Frontend) else (echo [...] Frontend...)
)
echo [!] Timeout. Cek: docker compose logs -f
pause & exit /b

:UP
echo Semua service aktif!
echo   Frontend: http://localhost:3002/
echo   Backend:  http://localhost:5003/health
start http://localhost:3002/
pause
```

**Penggunaan:**
```
start-app.bat         — Start normal
start-app.bat build   — Rebuild image + start
start-app.bat stop    — Hentikan semua
```

---

## Langkah 9 — Urutan Build & Deploy

```powershell
# 1. Buat semua file Dockerfile, .dockerignore, docker-compose.yml
# 2. Hapus container lama jika ada konflik nama
docker rm -f <app>-postgres <old-port-proxy-containers>

# 3. Build kedua image
docker compose build

# 4. Start semua
docker compose up -d

# 5. Verifikasi
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
docker exec <app>-backend curl -sf http://localhost:<port>/health
docker logs <app>-frontend --tail 20
```

---

## Pitfalls & Solusi

| Masalah | Penyebab | Solusi |
|---------|----------|--------|
| `connect ECONNREFUSED 127.0.0.1:5003` di frontend | SSR pakai `localhost` bukan nama service Docker | Fix `api.ts` — gunakan `BACKEND_URL` saat `typeof window === 'undefined'` |
| `Type "X" is neither a built-in type` (Prisma) | Model direferensikan di schema tapi belum ditulis | Tambah model yang hilang — periksa `init.sql` untuk kolom-kolomnya |
| `missing an opposite relation field` (Prisma) | Relasi satu arah — parent tidak punya array balik | Tambah `kibA TaKibA[]` di model parent |
| `ECONNREFUSED 172.17.0.3:5432` di backend | IP Docker container berubah setelah recreate | Ganti hardcode IP dengan nama service Docker (`postgres`) di `DATABASE_URL` |
| Container postgres tidak start karena volume sudah ada | `POSTGRES_PASSWORD` di compose berbeda dari password di data | Tidak masalah — env var diabaikan jika data sudah ada. Password aktual ada di data dir. |
| Port 5432 konflik antara DSS dan BMD | Keduanya mau bind port 5432 host | DSS pakai `:5432:5432`, BMD pakai `:5433:5432` |
| `npm run dev` lambat request pertama | Next.js dev mode compile on-demand | Normal — request pertama setelah restart butuh 5-15 detik |
| frontend curl tidak tersedia di container | Dockerfile frontend tidak install curl | Tambah `RUN apt-get update && apt-get install -y curl` di frontend Dockerfile, atau skip health check di bat |
| Build gagal karena `node_modules` OS berbeda | `.dockerignore` tidak exclude `node_modules` | Pastikan `node_modules` ada di `.dockerignore` |
| `.env` terbawa ke image Docker | `.dockerignore` tidak exclude `.env` | Tambah `.env` dan `.env.local` ke `.dockerignore` |

---

## Health Check Pattern

```bash
# Cek semua container BMD
docker ps --filter "name=bmd-" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

# Test backend (dari luar container)
curl http://localhost:5003/health
# Expected: {"status":"ok","db":"connected",...}

# Test dari dalam container
docker exec bmd-backend curl -sf http://localhost:5003/health

# Lihat log real-time
docker compose logs -f
docker compose logs backend --tail 50
docker compose logs frontend --tail 50
```

---

## Template Lengkap: Migrasi Proyek Baru

Checklist untuk migrasi proyek Node.js/Next.js baru ke Docker:

```
[ ] 1. Catat semua port yang dipakai (backend, frontend, postgres)
[ ] 2. Catat kredensial database (user, password, nama DB)
[ ] 3. Cek apakah volume postgres sudah ada (docker volume ls)
[ ] 4. Periksa entry point backend (index.js? server.js?)
[ ] 5. Buat backend/Dockerfile (dengan openssl + curl jika pakai Prisma)
[ ] 6. Buat frontend/Dockerfile
[ ] 7. Buat backend/.dockerignore (node_modules, .env, *.log)
[ ] 8. Buat frontend/.dockerignore (node_modules, .next, .env.local, *.log)
[ ] 9. Buat docker-compose.yml
        - POSTGRES_USER/PASSWORD/DB
        - DATABASE_URL backend → pakai nama service, bukan IP
        - BACKEND_URL frontend → http://<service-name>:<port>
        - NEXT_PUBLIC_API_URL → http://localhost:<port>
        - FRONTEND_URL backend (untuk CORS) → http://localhost:<frontend-port>
[ ] 10. Jika pakai Prisma:
        - Validasi schema: npx prisma validate
        - Fix semua @relation yang tidak punya inverse
        - Fix semua model yang direferensikan tapi tidak ditulis
[ ] 11. Fix next.config.ts: rewrite destination pakai BACKEND_URL env var
[ ] 12. Fix lib/api.ts: SSR menggunakan BACKEND_URL, browser menggunakan NEXT_PUBLIC_API_URL
[ ] 13. Build: docker compose build
[ ] 14. Run: docker compose up -d
[ ] 15. Verifikasi: docker ps, curl health, docker logs
[ ] 16. Update launcher .bat agar pakai docker compose
```

---

## Referensi Proyek Nyata

### DSS BPKAD (`D:\Antigravity\DSS_BPKAD`)
- Backend: `backend/Dockerfile` → `node server.js` (tanpa Prisma, pakai `pg` langsung)
- Frontend: `frontend/Dockerfile` → `npm run dev`
- Ports: Backend `:5000`, Frontend `:3000`, Postgres `:5432`
- Volume: `pg_data_sp2d` (external)
- Catatan: Frontend DSS pakai `npm run dev` di Docker (pola yang sama)

### SIMDA BMD (`D:\Antigravity\SIMDA_BMD`)
- Backend: `bmd-backend/Dockerfile` → `node index.js` (dengan Prisma + PostGIS)
- Frontend: `bmd-frontend/Dockerfile` → `npm run dev`
- Ports: Backend `:5003`, Frontend `:3002`, Postgres `:5433` (host)
- Volume: `bmd-postgres-data` (external)
- Fix yang dilakukan:
  - Tambah model `TaPengadaanSp2d` + `TaPengadaanSp2dRinc` di Prisma schema
  - Tambah `kibA TaKibA[]` dan `kibB TaKibB[]` ke model `RefUnit`
  - Fix `lib/api.ts` untuk SSR routing (pakai `BACKEND_URL`)
  - Fix `next.config.ts` rewrites (pakai `BACKEND_URL` env var)
