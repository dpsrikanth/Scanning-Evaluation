# Installation & setup guide

This document describes how to install and run the **Scanning & Evaluation** stack: MySQL, API, web app, and (optionally) the Windows scanner desktop client. For a short overview, see [README.md](README.md).

---

## 1. Prerequisites

| Component | Version / notes |
|-----------|------------------|
| **Docker Desktop** (or Docker Engine + Compose) | For MySQL and/or full stack |
| **Node.js** | **20.x LTS** recommended (matches `web` Docker build; API runs on current Node 18+ as well) |
| **npm** | Bundled with Node |
| **.NET SDK** | **8.0** + **Windows** (WinForms scanner app only) |
| **Git** | To clone the repository |

Optional:

- **MySQL client** (`mysql` CLI) for manual migration runs
- **PowerShell** or **bash** for commands below (examples use generic shell syntax; on Windows use PowerShell or adjust paths)

---

## 2. Clone and configuration files

```bash
git clone <repository-url>
cd Scanning&Evaluation
```

- Copy **`api/.env.example`** → **`api/.env`** before running the API locally.
- Optionally copy **`.env.example`** → **`.env`** in the **repository root** to set `MYSQL_ROOT_PASSWORD`, `JWT_SECRET`, or **`PHPMYADMIN_PORT`** for Docker Compose (see §4.3).
- Do **not** commit `.env` (it is gitignored).

---

## 3. Database initialization

### 3.1 Automatic (Docker empty volume)

Scripts under **`docker/mysql-init/`** are mounted into the MySQL container as `docker-entrypoint-initdb.d`. On a **fresh** data volume, MySQL runs them in **lexicographic filename order** (`01_…`, `02_…`, … `14_…`).

- **`01_schema.sql`** — Creates `ScanningDB` and `EvaluationDB` and core tables.
- **`02_seed.sql`** — Development seed data (eval users, scan users, sample exams/papers, etc.).
- **`03_…` through `16_…`** — Incremental migrations (templates, monitoring, QC workflow, zone barcode schedule, **shared booklet annotation** stamps, etc.). Apply new files in filename order on existing databases.

If you need a **clean reinstall**, remove the Docker volume (this **deletes all data**):

```bash
docker compose down -v
docker compose up -d --build
```

### 3.2 Existing MySQL (upgrade / manual apply)

If the database already exists from an older snapshot:

1. Do **not** re-run **`01_schema.sql`** / **`02_seed.sql`** blindly (duplicate object / seed errors).
2. Apply numbered scripts from **`03_`** upward in order.
3. Scripts **`06_session_geo.sql`** and **`07_question_sets.sql`** use `DATABASE()` without `USE`; if you pipe SQL without a default database, run them explicitly against **EvaluationDB**, for example:

   ```bash
   mysql -h 127.0.0.1 -P 3307 -u root -p --default-character-set=utf8mb4 EvaluationDB < docker/mysql-init/06_session_geo.sql
   mysql -h 127.0.0.1 -P 3307 -u root -p --default-character-set=utf8mb4 EvaluationDB < docker/mysql-init/07_question_sets.sql
   ```

4. Apply **`14_scan_qc_workflow.sql`** for QC columns, `Scan_DailyLots`, location QC toggles, and QC roles/users (if not already applied).
5. Apply **`15_zone_barcode_upload_schedule.sql`** and **`16_eval_booklet_shared_annotations.sql`** when you need those features (see filenames and comments inside each script).

---

## 4. Installation option A — Full stack with Docker Compose

Runs **MySQL**, **API**, and **Web** (Nginx + static React build).

### 4.1 Start

From the repository root:

```bash
docker compose up -d --build
```

### 4.2 URLs and defaults

| Service | URL | Default credentials |
|---------|-----|----------------------|
| Web UI | http://localhost:8080 | See `docker/mysql-init/02_seed.sql` (e.g. `admin` / `password123`, `ravi.rajan` / `password123`) |
| API | http://localhost:4000 | Health: `GET /api/health`. JWT from `POST /api/auth/login` |
| API Swagger (if enabled) | http://localhost:4000/api/docs | `ENABLE_SWAGGER=true` in `docker-compose.yml` for the API service |
| **phpMyAdmin** | **http://localhost:8081** (default) | **Server:** pre-set to `mysql` inside Docker. **User:** `root`, password: same as MySQL (default **`ScanEval@2026`**). Host port: **`PHPMYADMIN_PORT`** in root `.env` (default 8081). |
| MySQL (from host) | **127.0.0.1:3307** | User `root`, password **`ScanEval@2026`** unless you set `MYSQL_ROOT_PASSWORD` |

Inside Docker, the API connects to MySQL host **`mysql`** on port **3306** (not 3307).

### 4.3 Environment overrides (optional)

Create a **`.env`** file in the **project root** (same folder as `docker-compose.yml`) to override. See **`.env.example`** for a template:

```env
MYSQL_ROOT_PASSWORD=YourSecurePassword
JWT_SECRET=your-long-random-secret-min-32-chars
PHPMYADMIN_PORT=8081
```

Restart after changes:

```bash
docker compose up -d --build
```

### 4.4 Scan file storage (Docker)

The API container uses volume **`scan-output`** mounted at **`/data/scan-output`** and `SCAN_OUTPUT_PATH=/data/scan-output`. Ensure **Scanner Admin → Scan output paths** (and server config) align with where the API can write booklet files.

---

## 5. Installation option B — Development (MySQL in Docker, API + Web on host)

Useful for hot reload and debugging.

### 5.1 Start MySQL and phpMyAdmin (API + web on host)

```bash
docker compose -f docker-compose.dev.yml up -d
```

- **MySQL** at **127.0.0.1:3307** (same default root password unless overridden).
- **phpMyAdmin** at **http://localhost:8081** (or `PHPMYADMIN_PORT`), same login as in §4.2.

### 5.2 API

```bash
cd api
cp .env.example .env
# Edit .env — critical for Docker MySQL on the host:
```

Minimum relevant entries in **`api/.env`**:

```env
NODE_ENV=development
PORT=4000
CLIENT_URL=http://localhost:5173
SCAN_DB_HOST=localhost
SCAN_DB_PORT=3307
SCAN_DB_USER=root
SCAN_DB_PASSWORD=ScanEval@2026
SCAN_DB_NAME=ScanningDB
EVAL_DB_HOST=localhost
EVAL_DB_PORT=3307
EVAL_DB_USER=root
EVAL_DB_PASSWORD=ScanEval@2026
EVAL_DB_NAME=EvaluationDB
JWT_SECRET=change-this-in-production-min-32-chars
JWT_EXPIRES_IN=8h
STORAGE_MODE=local
SCAN_OUTPUT_PATH=D:/ScanOutput
```

Adjust **`SCAN_OUTPUT_PATH`** to an existing directory the API process can write to (Windows or Linux path). This is where scanned booklet folders/PDFs are stored in **local** storage mode.

Install and run:

```bash
npm install
npm run dev
```

API listens on **http://localhost:4000**.

Enable Swagger in dev if desired:

```env
ENABLE_SWAGGER=true
```

### 5.3 Web (Vite)

```bash
cd web
npm install
npm run dev
```

- Dev server: **http://localhost:5173**
- **`vite.config.js`** proxies **`/api`** → **`http://localhost:4000`**, and the client uses **`VITE_API_BASE`** default **`/api`**, so browser calls stay same-origin in dev.

Production build (optional local test):

```bash
npm run build
npm run preview
```

### 5.4 Playwright (web E2E)

From **`web/`**, with the **API** running (e.g. on **http://localhost:4000**):

```bash
npm install
node ./node_modules/@playwright/test/cli.js install chromium
npm run test:e2e
```

Use **`npm run test:e2e:ui`** for the Playwright UI. By default the config starts the Vite dev server on **:5173**; to test against **Docker web** on **:8080** without starting Vite, set `PLAYWRIGHT_WEB_SERVER=0` and `PLAYWRIGHT_BASE_URL=http://localhost:8080` (see **README.md**). Requires Chromium installed via the `install` command above.

### 5.5 CORS / `CLIENT_URL`

The API uses **`CLIENT_URL`** for CORS. For local dev include the Vite origin:

```env
CLIENT_URL=http://localhost:5173
```

For Docker production compose, multiple origins are already listed in `docker-compose.yml` (`CLIENT_URL`).

---

## 6. Installation option C — MySQL installed on the host (no Docker)

1. Install **MySQL 8.0+**, create server character set **utf8mb4**.
2. Run **`docker/mysql-init/01_schema.sql`** and **`02_seed.sql`**, then remaining numbered migrations as in §3.2.
3. Point **`api/.env`** at your host/port/user/password (often port **3306**).
4. Run API and Web as in **§5.2** and **§5.3** (and optionally Playwright in **§5.4**).

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

In the scanner login dialog, set the API base URL to your running API, e.g.:

- **http://localhost:4000** (API on host)
- **http://localhost:4000** if you use port mapping from Docker

Use a **ScanningDB** account:

- Seed: e.g. **`operator1`** / **`password123`** (see `02_seed.sql`), or  
- Create users in **Evaluation web → Admin → Scanner Admin → Scan users** (roles: Operator, Vendor QC, Customer QC, Admin).

### 7.4 Local storage path

The app prompts for / stores a local folder for queued JPEGs and PDFs (default often under **`C:\ScanOutput`**). Ensure disk space and write permissions.

---

## 8. First-use checklist

1. **MySQL** reachable; both **`ScanningDB`** and **`EvaluationDB`** exist.
2. Migrations through **`16_eval_booklet_shared_annotations.sql`** (or at least through **`14_`** for QC) applied according to the features you need.
3. **API** starts without DB connection errors (check console / logs). Health check: `GET /api/health`.
4. **Web** at **http://localhost:8080** loads; **admin** or **evaluator** login works (see **`02_seed.sql`**). **Evaluators** must pass **Session Setup** (camera, location, face match) before the dashboard if that flow is enabled.
5. **Booklets in EvaluationDB** appear on the evaluator dashboard only when **allocated** (e.g. via **Head Evaluator** at `/head-eval/assign` or admin tooling).
6. **Scanner Admin** (eval **Admin** role): configure exams, papers, workstations, **scan templates**, **scan output path**, **scan users**, **Scan QC flags** as needed.
7. **Scanner desktop** logs in, loads templates, completes a test scan and upload (check API logs under **`logs/`** if using Docker volume mount).
8. **phpMyAdmin** (optional): confirm databases and tables if you use the Docker service (**§4.2**).

---

## 9. Production hardening (summary)

- Set strong **`MYSQL_ROOT_PASSWORD`** and **`JWT_SECRET`** (long, random).
- Restrict **`CLIENT_URL`** to real front-end origins.
- Use HTTPS in front of Nginx / API in production.
- Review **`SCAN_OUTPUT_PATH`** / network paths for scan storage and backups.
- Disable or protect **`/api/docs`** if `ENABLE_SWAGGER=true`.

---

## 10. Troubleshooting

| Symptom | Things to check |
|---------|------------------|
| API cannot connect to DB | Host/port: use **`mysql`** inside Docker stack, **`localhost` + `3307`** from host with dev compose. User/password match `.env` and MySQL. |
| Web “Network error” / CORS | **`CLIENT_URL`** includes the exact browser origin (scheme + host + port). |
| Docker web 404 on refresh | Nginx SPA fallback is in **`web/nginx.conf`**; ensure you use the built image. |
| Scanner upload fails | API logs, **`SCAN_OUTPUT_PATH`** writable, active **Scan output path** in DB, JWT not expired. |
| QC / missing columns | Run **`14_scan_qc_workflow.sql`** (and earlier migrations) on **ScanningDB**. |
| Emgu / deskew errors on scanner | Logs under **`%AppData%\ScannerApp\logs\`**; app falls back to AForge; try turning off **Deskew & trim** temporarily. |

---

## 11. Related files

| File | Purpose |
|------|---------|
| [README.md](README.md) | Overview and quick reference |
| [REQUIREMENTS.md](REQUIREMENTS.md) | Requirements |
| `.env.example` | Root Docker overrides (e.g. `PHPMYADMIN_PORT`, `JWT_SECRET`) |
| `docker-compose.yml` | Full stack (MySQL, phpMyAdmin, API, web) |
| `docker-compose.dev.yml` | MySQL + phpMyAdmin (API and web on host) |
| `api/.env.example` | API environment template |
| `docker/mysql-init/*.sql` | Schema, seed, migrations |
| `web/e2e/`, `web/playwright.config.js` | Playwright E2E tests |
