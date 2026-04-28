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
├── sql/mysql-init/               # Numbered SQL: schema, seed, incremental (run in order on a fresh MySQL)
│   ├── 01_schema.sql, 02_seed.sql, then 03_… through 17_…
│
├── migrations/                    # Reference incremental scripts (and README)
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
| **Evaluator-paper mapping** | Head Evaluator can map evaluators to specific papers; **manual and auto assignment enforce booklet `PaperID` against evaluator paper mappings**. |

## Quick start (local)

You need **MySQL 8+** with `ScanningDB` and `EvaluationDB`. For a new database, run the numbered scripts under [`sql/mysql-init/`](sql/mysql-init/) in filename order, or use the full DDL in `docs/Scanning_Evaluation_Full_Production_MySQL_DDL.sql` and apply migrations as needed.  
Important for current head-eval assignment behavior: apply **`sql/mysql-init/19_evaluator_papers.sql`** (or `migrations/019_evaluator_papers.sql`) so evaluator-paper scope enforcement works. Details are in **[INSTALLATION.md](INSTALLATION.md)**.

**API and web** (separate terminals):

```bash
cd api && cp .env.example .env && npm install && npm run dev
cd web && npm install && npm run dev
```

- **API** — [http://localhost:4000](http://localhost:4000) (health: `GET /api/health`; Swagger: `/api/docs` when `ENABLE_SWAGGER=true`)
- **Web (Vite)** — [http://localhost:5173](http://localhost:5173)

**Example logins** (after seed; see `sql/mysql-init/02_seed.sql` — reset passwords in the DB if they were changed locally):

- **Admin (evaluation):** `admin` / `password123`
- **Evaluator:** `ravi.rajan` / `password123` (completes session setup with camera/geo/face on first use)
- **Head Evaluator / admin tasks:** use `admin` or an account with **HeadEvaluator** role as defined in your DB
- **Scanner desktop / QC:** `operator1` / `password123` (seed) or **Admin → Scanner Admin → Scan users**; QC seed users (e.g. `vendorqc1`) in `14_scan_qc_workflow.sql` if applied

**Evaluation flow (typical):** scan/sync booklets to **EvaluationDB** → **Head Evaluator** maps evaluator to paper(s) in assignment UI → **Head Evaluator** (or admin tools) assigns booklets (manual or auto) to eligible evaluators only → evaluator signs in → **Session Setup** → **Dashboard** → open booklet → **Evaluate** → submit marks.

### Evaluator-paper mapping (assignment rule)

- Mapping data is stored in `Eval_EvaluatorPapers (UserID, PaperID)`.
- **No mapping = no assignments** for that evaluator.
- **Manual assignment** returns `paper_mismatch` when selected evaluator is not mapped to booklet paper.
- **Auto assignment** only picks evaluators mapped to each booklet paper; if none exist, status is `no_evaluator`.
- Head-eval API supports:
  - `GET /api/headeval/evaluators/:userId/papers`
  - `PUT /api/headeval/evaluators/:userId/papers` with `{ "paperIds": [ ... ] }`

### Playwright (web E2E)

With the **API** running (e.g. on **http://localhost:4000**), from `web/`:

```bash
npm install
node ./node_modules/@playwright/test/cli.js install chromium
npm run test:e2e
```

`npm run test:e2e:ui` opens the Playwright UI. Tests start Vite on **:5173** unless it is already running. To use another base URL, set `PLAYWRIGHT_BASE_URL` (and disable the test web server with `PLAYWRIGHT_WEB_SERVER=0` if your app is already served).

### Desktop Scanner (.NET 8)

```bash
cd scanner-desktop/ScannerApp
dotnet run
```

Set the API base URL to `http://localhost:4000` and sign in with a **ScanningDB** user (e.g. `operator1` / `password123` from seed, or a user created under Scanner Admin).

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

Step-by-step setup (MySQL, API, web, scanner desktop, env vars, troubleshooting) is in **[INSTALLATION.md](INSTALLATION.md)**.
