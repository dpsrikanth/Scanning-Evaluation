# Scanning & Evaluation System

System for scanning student answer booklets, optional **vendor / customer QC** on batches, and on-screen evaluation by evaluators.

## Repository Structure

```
Scanning&Evaluation/
├── REQUIREMENTS.md                # Formal requirements specification
├── docs/
│   ├── ARCHITECTURE.md           # Architecture diagrams (Mermaid)
│   ├── Scanning_Evaluation_Full_Production_MySQL_DDL.sql
│   └── AI_Cursor_Advanced_System_Prompt_Pack/
│
├── docker/
│   └── mysql-init/               # Numbered SQL: schema, seed, incremental migrations
│       ├── 01_schema.sql … 02_seed.sql
│       └── 03_… through 16_eval_booklet_shared_annotations.sql (apply in order on existing DBs)
│
├── migrations/                    # Legacy / reference incremental scripts
│   ├── 001_scanning_additions.sql
│   └── 002_evaluation_additions.sql
│
├── api/                           # Node.js Express API (serves web + desktop)
│   ├── src/
│   │   ├── config/               # env, database
│   │   ├── middleware/           # auth, validation, audit, scan booklet access
│   │   ├── modules/
│   │   │   ├── auth/             # Eval + scan JWT (source: eval | scan)
│   │   │   ├── scan/             # Booklet upload, files, rejected list for operators
│   │   │   ├── scanqc/           # Vendor & customer QC (lots, decisions, lot approve)
│   │   │   ├── scanadmin/        # Exams, papers, templates, output paths, **scan users**, QC toggles
│   │   │   ├── eval/             # Evaluations, marks, page visits
│   │   │   ├── allocation/       # (placeholder)
│   │   │   └── reports/          # (placeholder)
│   │   └── utils/
│   └── package.json
│
├── web/                           # React + Vite (evaluation + admin + QC portal)
│   ├── e2e/                      # Playwright E2E (smoke + admin login)
│   ├── src/
│   │   ├── components/
│   │   ├── pages/                # Login, Dashboard, Evaluate, AdminSettings, **ScanQcPortal**
│   │   └── services/             # API client (scan, scanadmin, scanQc)
│   ├── playwright.config.js
│   └── package.json
│
├── scanner-desktop/               # .NET 8 Windows Forms (scanning app)
│   ├── ScannerApp.slnx
│   └── ScannerApp/
│       ├── Forms/                # LoginForm, MainForm, QcRejectedForm
│       ├── Services/             # ApiService, PdfService, WIA / TWAIN scanners
│       ├── Models/
│       └── Utils/                # ImageHelper, **OpenCvImagePreprocessor** (Emgu CV), HashHelper, AppLogger
│
└── evaluation-app/                # (legacy scaffold — replaced by api/ + web/)
```

## Features (recent)

| Area | Description |
|------|-------------|
| **Scan QC** | Two-stage QC (vendor → customer): daily lots by location/paper/date, per-booklet approve/reject, lot approve with pending/rejected counts. Toggled per location in **Scanner Admin → Scan QC flags**. |
| **Scan users** | **Scanner Admin → Scan users**: create accounts with roles **Operator**, **Vendor QC**, **Customer QC**, or **Admin** (ScanningDB; bcrypt passwords). |
| **QC portal** | **Vendor QC** / **Customer QC** sign in with scanner staff login (`source: scan`); web routes to **Scan QC** (`/scan-qc`). |
| **Operator rescan** | Desktop: **QC rejected…** (header) lists server-rejected booklets; optional **Server BookletID (QC rescan)** forces folder/upload id so the API upserts the same booklet. |
| **Deskew & trim** | Desktop checkbox (default on): software pipeline **Emgu CV** (grayscale, Otsu, Hough line deskew, contour crop) with **AForge** fallback, then edge trim; saved JPEGs feed the booklet **PDF**. |
| **Skip blank pages** | Controlled by the **scan template** from the server (no separate desktop toggle). |
| **Web UI theme** | Visual design uses the same **Material indigo** palette as **scanner-desktop** (primary `#3F51B5` / `#303F9F`, surface `#F5F7FA`). |
| **Evaluator session** | After login, evaluators complete **Session Setup** (camera, geolocation, face match vs registration photo) before the dashboard. |
| **Head Evaluator** | Web routes `/head-eval/login`, `/head-eval/assign` for bulk allocation to evaluators. |
| **phpMyAdmin** | Optional Docker service for **MySQL** administration (not PostgreSQL). |

## Quick Start (Docker)

### Full stack (MySQL + API + Web)

```bash
docker compose up -d --build
```

| Service | URL | Notes |
|---------|-----|--------|
| Web (Evaluation UI) | http://localhost:8080 | Nginx → React build |
| API | http://localhost:4000 | Health: `GET /api/health` — Swagger: `/api/docs` when `ENABLE_SWAGGER=true` |
| MySQL (host port) | **localhost:3307** → container **3306** | root / `ScanEval@2026` (or `MYSQL_ROOT_PASSWORD` from `.env`) |
| **phpMyAdmin** | **http://localhost:8081** | Login as `root` with the same MySQL password; server host **`mysql`** is preconfigured in Docker. Port: `PHPMYADMIN_PORT` in root `.env`. |

Optional **root** `.env` (same folder as `docker-compose.yml`): see **`.env.example`** — e.g. `PHPMYADMIN_PORT`, `JWT_SECRET`, `MYSQL_ROOT_PASSWORD`.

**Example logins** (after seed; see `docker/mysql-init/02_seed.sql` — reset passwords in DB if they were changed locally):

- **Admin (evaluation):** `admin` / `password123`
- **Evaluator:** `ravi.rajan` / `password123` (completes session setup with camera/geo/face on first use)
- **Head Evaluator / admin tasks:** use `admin` or an account with **HeadEvaluator** role as defined in your DB
- **Scanner desktop / QC:** `operator1` / `password123` (seed) or **Admin → Scanner Admin → Scan users**; QC seed users (e.g. `vendorqc1`) in `14_scan_qc_workflow.sql` if applied

**Evaluation flow (typical):** scan/sync booklets to **EvaluationDB** → **Head Evaluator** (or admin tools) **assigns** booklets to evaluators → evaluator signs in → **Session Setup** → **Dashboard** → open booklet → **Evaluate** → submit marks.

### Development mode (MySQL + phpMyAdmin in Docker, API + Web on host)

```bash
docker compose -f docker-compose.dev.yml up -d
```

phpMyAdmin: **http://localhost:8081** (same as full stack). Then run API and Web locally:

```bash
cd api && cp .env.example .env && npm install && npm run dev
cd web && npm install && npm run dev
```

Point `api/.env` at Docker MySQL on the **host**:

```env
SCAN_DB_HOST=localhost
SCAN_DB_PORT=3307
SCAN_DB_PASSWORD=ScanEval@2026
EVAL_DB_HOST=localhost
EVAL_DB_PORT=3307
EVAL_DB_PASSWORD=ScanEval@2026
```

### Playwright (web E2E)

With the **API** reachable at `http://localhost:4000` (Docker or local), from `web/`:

```bash
npm install
node ./node_modules/@playwright/test/cli.js install chromium   # once per machine
npm run test:e2e
```

`npm run test:e2e:ui` opens the Playwright UI. Tests start Vite on **:5173** unless it is already running. To target **Docker web** on **:8080** instead: `set PLAYWRIGHT_WEB_SERVER=0` and `set PLAYWRIGHT_BASE_URL=http://localhost:8080` (PowerShell: `$env:PLAYWRIGHT_WEB_SERVER='0'; $env:PLAYWRIGHT_BASE_URL='http://localhost:8080'`).

### Desktop Scanner (.NET 8)

```bash
cd scanner-desktop/ScannerApp
dotnet run
```

Set API base URL to `http://localhost:4000` and sign in with a **ScanningDB** user (e.g. `operator1` / `password123` from seed, or a user created under Scanner Admin).

### Database initialization

- **New volume**: `docker/mysql-init/*.sql` runs automatically in filename order when MySQL data is empty.
- **Existing database**: run numbered scripts **03+** through **16** in order (skip **01**/**02** if already applied). Some scripts expect a default database; e.g. run `06`/`07` with `-D EvaluationDB` if you see “No database selected”. See `14_scan_qc_workflow.sql` (QC), `15_zone_barcode_upload_schedule.sql`, `16_eval_booklet_shared_annotations.sql` (shared stamps) as needed.

## Architecture

- **API** (Express): dual DB (ScanningDB, EvaluationDB); JWT includes `roleName` and `source` for scan vs eval clients.
- **Desktop scanner**: login, templates, ADF scan (WIA or TWAIN), barcode read (ZXing.Net), optional software deskew/trim, local queue, PDF upload.
- **Web**: evaluators (dashboard, viewer, marks, session setup); **Admin** (eval users, SMTP, scanner admin, **scan users**, QC flags); **Head Evaluator** assignment; **Vendor/Customer QC** portal. UI theme matches **scanner-desktop** (indigo/surface).
- **MySQL 8**: `ScanningDB` (booklets, QC, scan users), `EvaluationDB` (evaluations, users).

## Tech Stack

| Component | Technology |
|-----------|------------|
| API | Node.js, Express, MySQL2, JWT, Winston, bcryptjs |
| Web | React 18, Vite, React Router, face-api.js (session photo), **Playwright** (E2E) |
| Scanner | .NET 8 WinForms, NTwain, ZXing.Net, PdfSharpCore, **Emgu.CV** (+ runtime), AForge.Imaging |
| Database | MySQL 8+ |
| Barcode | ZXing.Net (Code128 + QR) |

## Git ignore

Root `.gitignore` covers `node_modules`, `.env`, logs, `dist`/`build`, and `**/bin/**` / `**/obj/**`. The `api/` folder may keep its own `.gitignore` for API-only workflows.

## Detailed installation

Step-by-step setup (Docker full stack, dev mode, manual DB, scanner desktop, env vars, troubleshooting) is in **[INSTALLATION.md](INSTALLATION.md)**.
