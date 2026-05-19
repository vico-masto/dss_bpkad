# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

DSS BPKAD — a Decision Support System for an Indonesian local-government finance agency (Badan Pengelola Keuangan dan Aset Daerah). Its core job is **reconciling the Buku Kas Umum (BKU)** — internal cash ledger built from SP2D disbursements, revenue (pendapatan), tax (pajak/potongan) — **against bank statements (rekening koran)**. Domain terms, UI text, and DB columns are in Indonesian; keep that convention when adding code.

The repo is a two-app monorepo (no root package.json, not a git repo):

- `backend/` — Express 5 API, Prisma 6 + PostgreSQL, JWT auth, OpenRouter/Gemini AI.
- `frontend/` — Next.js 16 + React 19 (App Router, TypeScript, Tailwind 4). **This is the live frontend.**
- `bpkad-dss-frontend/` — an empty default `create-next-app` scaffold. Ignore it unless explicitly asked.

`README.md` is outdated (claims Express+raw-pg+Next.js 15). `BLUEPRINT_DSS_BPKAD.md` is the more accurate architecture overview. Trust the code over both.

## Run / build

```powershell
# Backend (http://localhost:5000)
cd backend; npm install; node server.js     # or: npx nodemon server.js

# Frontend (http://localhost:3000)
cd frontend; npm install; npm run dev
cd frontend; npm run build                   # production build
cd frontend; npm run lint                    # eslint (only quality gate that exists)
```

`run_app.bat` at the repo root launches both. There is **no test suite** — the backend `npm test` is a placeholder that exits 1, and the frontend has lint only. Don't claim tests pass; verify behavior by running the app.

## Database — important nuances

- **Prisma is the only data layer used by controllers.** Every controller imports the shared singleton `backend/prismaClient.js`. `backend/config/db.js` (a raw `pg` Pool) exists but is **not used by any controller** — treat it as legacy; don't introduce raw-pg queries into request handlers.
- **There are no Prisma migrations** (`backend/prisma/migrations/` does not exist). The schema is owned by raw SQL in `backend/database/init.sql`; `backend/prisma/schema.prisma` is a *reflection* of that DB (UUID PKs via `dbgenerated("gen_random_uuid()")`, `@@map` to snake_case tables). Consequence: **editing `schema.prisma` alone does not change the database.** A schema change means updating `init.sql` (and applying it / `prisma db push`) and re-running `npx prisma generate`. ~18 models; key ones: `users`, `data_sp2d` + `detail_sp2d` + potongan, `data_pendapatan`, `bank_statement`, `setoran_pajak`, `master_sumber_dana`, `jurnal_talangan`, `master_pagu`, `data_penyesuaian`.
- Money is `Decimal(20,2)`. Reconciliation matches on value + a date window (H+7). Decimal type mismatches are the usual cause of "selisih tidak akurat" bugs — keep casting consistent.
- DB credentials, `JWT_SECRET`, and AI API keys are committed in `backend/.env` (also `password db.txt` at root). This is existing state; do not reproduce these secrets into new files or move them around without being asked.

## Backend request flow

`server.js` mounts seven route modules, all under `/api`:

| Mount | File | Notes |
|---|---|---|
| `/api/auth` | authRoutes | login/register, JWT issue |
| `/api/sp2d` | sp2dRoutes | SP2D CRUD, potongan, Excel import (multer) |
| `/api/pendapatan` | pendapatanRoutes | revenue |
| `/api/dss` | dssRoutes | dashboard, talangan, penyesuaian, saldo-awal, simulator, intelligence/AI, setoran-pajak |
| `/api/reports` | reportRoutes | **all reconciliation endpoints live here**, e.g. `/api/reports/reconciliation/match` (magic match), `/match-smart`, `/data`, `/anomalies` |
| `/api/admin` | adminRoutes | the only routes using `roleMiddleware` |
| `/api/bku` | bkuRoutes | Buku Kas Umum ledger |

A common surprise: reconciliation is under `/api/reports/reconciliation/*` (handled by `reconciliationController`), not `/api/dss`, even though `dssRoutes` also imports that controller.

Layering: `routes/` → `middleware/authMiddleware` (JWT bearer, sets `req.user`) → `controllers/` (business logic, Prisma) → `services/` (`aiService`, `auditService`, `dssService`) and `utils/` (`accountingEngine`, `dateUtils`). `roleMiddleware` is a `checkRole(allowedRoles)` factory, applied only in `adminRoutes`; every other route is auth-gated but not role-gated.

The repo root of `backend/` is littered with ~120 one-off scripts (`check*.js`, `debug*.js`, `analyze*.js`, `audit*.js`, `seed*.js`, `migrate_*.js`, plus `scratch/`). These are ad-hoc forensic/data-fix tools, **not** part of the running app — don't treat them as architecture and don't wire them into `server.js`.

## Frontend

- Two route trees under `frontend/src/app/`: a top-level set (`/login`, `/sp2d`, `/pendapatan`, …) and the main authenticated app under `/dashboard/*` (rekon, ledgers, sp2d, talangan, simulator, users, …). When adding a feature, check whether a `/dashboard/*` equivalent already exists before adding to the top-level tree.
- API access goes through `frontend/src/lib/api.ts`: a single Axios instance, base URL `NEXT_PUBLIC_API_URL` (default `http://localhost:5000/api`). Request interceptor attaches `Bearer ${localStorage.token}`; a 401 response clears `token`/`user` and redirects to `/`. Use this client for all backend calls; don't hand-roll fetch with manual auth headers.
- Data fetching: SWR. UI: shadcn/Radix + Tailwind 4 + Framer Motion. Charts: Chart.js. Client-side document work: pdfjs-dist, tesseract.js (OCR), xlsx, jspdf, puppeteer/html2pdf for export.

### Next.js 16 is not the version you know

`frontend/AGENTS.md` (also referenced by `frontend/CLAUDE.md`) warns: this Next.js has breaking changes vs. training data — APIs, conventions, and file structure may differ. **Before writing or modifying frontend Next.js code, read the relevant guide in `frontend/node_modules/next/dist/docs/`** and heed deprecation notices rather than relying on remembered Next.js patterns.

## AI integration

`backend/services/aiService.js` powers the intelligence/chat features. Primary provider is **OpenRouter** (`deepseek/deepseek-chat`) via `OPENROUTER_API_KEY`; Google Gemini (`@google/generative-ai`, `GEMINI_API_KEY`) is the fallback. Exposed through `intelligenceController` at `/api/dss/intelligence/*`.
