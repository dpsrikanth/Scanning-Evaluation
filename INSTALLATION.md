# Installation & setup guide

This document describes how to install and run the **Scanning & Evaluation** stack: MySQL, API, web app, and (optionally) the Windows scanner desktop client. For a short overview, see [README.md](README.md).

---

## 1. Prerequisites

| Component | Version / notes |
|-----------|------------------|
| **MySQL** | **8.0+** (utf8mb4) — required for API and desktop clients |
| **Node.js** | **20.x LTS** recommended (API also runs on current Node 18+) |
| **npm** | Bundled with Node |
| **.NET SDK** | **8.0** + **Windows** (WinForms scanner app only) |
| **Git** | To clone the repository |

Optional:

- **MySQL client** (`mysql` CLI) or a GUI to run **SQL** scripts
- **PowerShell** or **bash** for commands below (examples use generic shell syntax; on Windows use PowerShell or adjust paths)

---

## 2. Clone and configuration files

```bash
git clone <repository-url>
cd Scanning&Evaluation
```

- Copy **`api/.env.example`** → **`api/.env`** before running the API.
- Do **not** commit `.env` (it is gitignored).
- A root **`.env.example`** (if present) is optional reference only; the API loads **`api/.env`**.

---

## 3. Database initialization

### 3.1 New database (recommended path)

Run scripts under **`sql/mysql-init/`** in **lexicographic filename order** against your MySQL server.

- **`01_schema.sql`** — Creates `ScanningDB` and `EvaluationDB` and core tables.
- **`02_seed.sql`** — Development seed data (eval users, scan users, sample exams/papers, etc.).
- **`03_…` through `17_…`** — Additional migrations (templates, monitoring, QC workflow, mirror config, etc.).

**Alternatives:** for some deployments you may use the full DDL in **`docs/Scanning_Evaluation_Full_Production_MySQL_DDL.sql`**, then apply any incremental scripts from `sql/mysql-init` or `migrations/` that are not in your baseline. See [migrations/README.md](migrations/README.md) for the migration folder’s focus.

### 3.2 Existing MySQL (upgrade / manual apply)

If the database already exists from an older snapshot:

1. Do **not** re-run **`01_schema.sql`** / **`02_seed.sql`** blindly (duplicate object / seed errors).
2. Apply only the numbered scripts you have not run yet, in order.
3. Some scripts (for example `06_session_geo.sql`, `07_question_sets.sql`) use `DATABASE()` without `USE`; if you run them without a default database, target **EvaluationDB** explicitly:

   ```bash
   mysql -h 127.0.0.1 -P 3306 -u root -p --default-character-set=utf8mb4 EvaluationDB < sql/mysql-init/06_session_geo.sql
   mysql -h 127.0.0.1 -P 3306 -u root -p --default-character-set=utf8mb4 EvaluationDB < sql/mysql-init/07_question_sets.sql
   ```

4. Apply **`14_scan_qc_workflow.sql`** for QC columns, `Scan_DailyLots`, location QC toggles, and QC roles/users (if not already applied).
5. Apply later files (e.g. **`16_eval_booklet_shared_annotations.sql`**, **`17_scan_mirror_config.sql`**) when you need those features.

---

## 4. API (development)

```bash
cd api
cp .env.example .env
# Edit .env for your host MySQL
```

### 4.1 Environment variables (minimum for local)

```env
NODE_ENV=development
PORT=4000
CLIENT_URL=http://localhost:5173
SCAN_DB_HOST=localhost
SCAN_DB_PORT=3306
SCAN_DB_USER=root
SCAN_DB_PASSWORD=your-mysql-root-password
SCAN_DB_NAME=ScanningDB
EVAL_DB_HOST=localhost
EVAL_DB_PORT=3306
EVAL_DB_USER=root
EVAL_DB_PASSWORD=your-mysql-root-password
EVAL_DB_NAME=EvaluationDB
JWT_SECRET=change-this-in-production-min-32-chars
JWT_EXPIRES_IN=8h
STORAGE_MODE=local
SCAN_OUTPUT_PATH=D:/ScanOutput
```

Adjust **`SCAN_OUTPUT_PATH`** to an existing directory the API process can write to (Windows or Linux path). This is where scanned booklet folders and PDFs are stored in **local** storage mode.

```bash
npm install
npm run dev
```

API listens on **http://localhost:4000**.

**Swagger in dev (optional):**

```env
ENABLE_SWAGGER=true
```

### 4.2 CORS / `CLIENT_URL`

The API uses **`CLIENT_URL`** for CORS. For Vite on port **5173**:

```env
CLIENT_URL=http://localhost:5173
```

For multiple dev origins, use a comma-separated list in **`CLIENT_URL`** (see `api/src/config/env.js`).

---

## 5. Web (Vite)

```bash
cd web
npm install
npm run dev
```

- Dev server: **http://localhost:5173**
- **`vite.config.js`** proxies **`/api`** → **`http://localhost:4000`**, and the client uses **`VITE_API_BASE`** default **`/api`**, so browser calls stay same-origin in dev.

**Production build (optional local test):**

```bash
npm run build
npm run preview
```

Host the **`web/dist/`** output behind any static file server; configure public URLs and `CLIENT_URL` / HTTPS as appropriate.

---

## 6. Playwright (web E2E)

From **`web/`**, with the **API** running (e.g. on **http://localhost:4000**):

```bash
npm install
node ./node_modules/@playwright/test/cli.js install chromium
npm run test:e2e
```

Use **`npm run test:e2e:ui`** for the Playwright UI. The default config starts the Vite dev server on **:5173**; to test against a different base URL, set `PLAYWRIGHT_BASE_URL` and see **`web/playwright.config.js`**.

---

## 7. Windows scanner desktop app

### 7.1 Requirements

- **Windows** (WinForms + TWAIN/WIA)
- **.NET 8 SDK**
- Physical or virtual scanner with **WIA** or **TWAIN** driver

### 7.2 Build and run

```bash
cd scanner-desktop/ScannerApp
dotnet restore
dotnet run
```

Release build:

```bash
dotnet build -c Release
```

The app restores **Emgu.CV** and **Emgu.CV.runtime.windows** NuGet packages (deskew pipeline).

### 7.3 Connect to API

In the scanner login dialog, set the API base URL to your running API, e.g. **http://localhost:4000**.

Use a **ScanningDB** account:

- Seed: e.g. **`operator1`** / **`password123`** (see `sql/mysql-init/02_seed.sql`), or
- Create users in **Evaluation web → Admin → Scanner Admin → Scan users** (roles: Operator, Vendor QC, Customer QC, Admin).

### 7.4 Local storage path

The app prompts for or stores a local folder for queued JPEGs and PDFs (default often under **`C:\ScanOutput`**). Ensure disk space and write permissions.

---

## 8. First-use checklist

1. **MySQL** reachable; both **`ScanningDB`** and **`EvaluationDB`** exist.
2. Schema/seed and migrations through the files you need (e.g. through **`16_`** and **`17_`** for shared annotations and mirror config) are applied in order.
3. **API** starts without DB connection errors (check console or **`api/logs/`**). Health: `GET /api/health`.
4. **Web** at **http://localhost:5173** loads; **admin** or **evaluator** login works. **Evaluators** must pass **Session Setup** (camera, location, face match) before the dashboard if that flow is enabled.
5. **Booklets in EvaluationDB** appear on the evaluator dashboard only when **allocated** (e.g. via **Head Evaluator** at `/head-eval/assign` or admin tooling).
6. **Scanner Admin** (eval **Admin** role): configure exams, papers, workstations, **scan templates**, **scan output path**, **scan users**, **Scan QC flags** as needed.
7. **Scanner desktop** logs in, loads templates, completes a test scan and upload (check API logs if uploads fail).

---

## 9. Production hardening (summary)

- Use strong **MySQL** credentials and a long random **`JWT_SECRET`**.
- Restrict **`CLIENT_URL`** to real front-end origins.
- Use HTTPS in front of the API and static site in production.
- Review **`SCAN_OUTPUT_PATH`** / network paths for scan storage and backups.
- Disable or protect **`/api/docs`** if `ENABLE_SWAGGER=true`.

---

## 10. Troubleshooting

| Symptom | Things to check |
|---------|------------------|
| API cannot connect to DB | Host, port, user, password, and database names in **`api/.env`**; MySQL listening and firewalls. |
| Web “Network error” / CORS | **`CLIENT_URL`** includes the exact browser origin (scheme, host, port). |
| Scanner upload fails | API logs, **`SCAN_OUTPUT_PATH`** writable, active **Scan output path** in DB, JWT not expired. |
| QC / missing columns | Run **`14_scan_qc_workflow.sql`** (and earlier migrations) on **ScanningDB** as needed. |
| Emgu / deskew errors on scanner | Logs under **`%AppData%\ScannerApp\logs\`**; app falls back to AForge; try turning off **Deskew & trim** temporarily. |

---

## 11. Related files

| File | Purpose |
|------|---------|
| [README.md](README.md) | Overview and quick reference |
| [REQUIREMENTS.md](REQUIREMENTS.md) | Requirements |
| `api/.env.example` | API environment template |
| `sql/mysql-init/*.sql` | Baseline schema, seed, ordered migrations for MySQL |
| [migrations/README.md](migrations/README.md) | Notes on `migrations/*.sql` |
| `web/e2e/`, `web/playwright.config.js` | Playwright E2E tests |
