# Schema Migrations

Incremental SQL migrations for the Scanning & Evaluation system.

## Prerequisites

- MySQL 8+
- Existing databases: `ScanningDB`, `EvaluationDB` (with baseline schema)

## Execution Order

1. **001_scanning_additions.sql** — Locations, workstations, sync queue, new columns in scanning tables
2. **002_evaluation_additions.sql** — Locations, metadata, question scheme, page visit log, attendance, etc.
3. **006_scan_template_extended.sql** — `Scan_ScanTemplates`: `PdfFilenameFormat`, `BarcodeStartPage`, `BarcodeZonesJson`, `UploadScheduleMode`, `UploadScheduleParam` (required for scan template admin UI / scanner-desktop parity). **Run this if you see SQL errors about missing `BarcodeStartPage`.**

## Usage

```bash
mysql -u root -p < migrations/001_scanning_additions.sql
mysql -u root -p < migrations/002_evaluation_additions.sql
```

Or run each statement manually if you need to handle constraints (e.g., add Locations/Workstations before FKs).

## Note on Foreign Keys

Some FK additions may fail if referenced tables are empty. In that case:

1. Insert at least one row into `Scan_Locations` / `Eval_Locations` before adding FKs.
2. Or comment out FK additions and add them after seeding data.

## Full DDL vs Migrations

For **fresh installs**, use the full DDL: `Scanning_Evaluation_Full_Production_MySQL_DDL.sql`

For **existing databases**, use these migrations.
