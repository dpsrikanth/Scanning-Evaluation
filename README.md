# Scanning & Evaluation System

System for scanning student answer booklets and on-screen evaluation by evaluators.

## Repository Structure

```
Scanning&Evaluation/
├── REQUIREMENTS.md                # Formal requirements specification
├── docs/
│   ├── ARCHITECTURE.md           # Architecture diagrams (Mermaid)
│   ├── Scanning_Evaluation_Full_Production_MySQL_DDL.sql
│   └── AI_Cursor_Advanced_System_Prompt_Pack/
│
├── migrations/                    # Incremental schema migrations
│   ├── 001_scanning_additions.sql
│   └── 002_evaluation_additions.sql
│
├── api/                           # Node.js Express API (serves web + desktop)
│   ├── src/
│   │   ├── config/               # env, database
│   │   ├── middleware/           # auth, validation, audit, error handler
│   │   ├── modules/
│   │   │   ├── auth/            # Controller → Service → Repository
│   │   │   ├── scan/            # Scan settings, booklets, files
│   │   │   ├── eval/            # Evaluations, marks, page visits
│   │   │   ├── allocation/      # (placeholder)
│   │   │   └── reports/         # (placeholder)
│   │   └── utils/               # logger, response helpers, hash
│   └── package.json
│
├── web/                           # React + Vite (evaluation web app)
│   ├── src/
│   │   ├── components/           # Layout, Header
│   │   ├── pages/               # Login, Dashboard, Evaluate
│   │   └── services/            # API client
│   └── package.json
│
├── scanner-desktop/               # .NET 8 Windows Forms (scanning app)
│   ├── ScannerApp.slnx
│   └── ScannerApp/
│       ├── Forms/                # LoginForm, MainForm
│       ├── Services/             # ApiService, BarcodeService
│       ├── Models/               # API models
│       └── Utils/                # HashHelper, ImageHelper
│
└── evaluation-app/                # (legacy scaffold — being replaced by api/ + web/)
```

## Quick Start (Docker)

### Full stack (MySQL + API + Web)
```bash
docker compose up -d --build
```

| Service | URL | Credentials |
|---------|-----|-------------|
| Web (Evaluation UI) | http://localhost | `ravi.rajan` / `password123` |
| API | http://localhost:4000 | — |
| MySQL | localhost:3306 | root / `ScanEval@2026` |

### Development mode (MySQL only in Docker)
```bash
docker compose -f docker-compose.dev.yml up -d

# Then run API and Web locally:
cd api && cp .env.example .env && npm install && npm run dev
cd web && npm install && npm run dev
```

Update `api/.env` to point to Docker MySQL:
```
SCAN_DB_HOST=localhost
SCAN_DB_PASSWORD=ScanEval@2026
EVAL_DB_HOST=localhost
EVAL_DB_PASSWORD=ScanEval@2026
```

### Desktop Scanner (.NET 8)
```bash
cd scanner-desktop/ScannerApp
dotnet run
```
Point the scanner login at `http://localhost:4000` and use `scanadmin` / `password123`.

### Manual database setup (without Docker)
```bash
mysql -u root -p < docs/Scanning_Evaluation_Full_Production_MySQL_DDL.sql
mysql -u root -p < docker/mysql-init/02_seed.sql
```

## Architecture

- **API** (Express) serves both the web evaluation app and the desktop scanner
- **Desktop scanner** logs in via API, fetches settings, scans pages via ADF (TWAIN), reads barcodes (ZXing.Net), saves images locally, uploads metadata to API
- **Web app** (React) used by evaluators: dashboard, document viewer, marks entry, page-visit tracking
- **MySQL 8** with two databases: ScanningDB and EvaluationDB

## Tech Stack

| Component | Technology |
|-----------|-----------|
| API | Node.js, Express, MySQL2, JWT, Winston |
| Web | React 18, Vite, React Router |
| Scanner | .NET 8 WinForms, NTwain, ZXing.Net |
| Database | MySQL 8+ |
| Barcode | ZXing.Net (Code128 + QR) |
