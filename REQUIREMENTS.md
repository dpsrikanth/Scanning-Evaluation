# Scanning & Evaluation System — Formal Requirements Specification

**Document Version:** 1.1  
**Date:** 2026-04-21  
**Status:** Draft for Development

---

## 1. Introduction

### 1.1 Purpose

This document defines the functional and non-functional requirements for a **Scanning and Evaluation System** for student answer sheets. The system comprises:

1. **Desktop Scanning Software** — For scanning answer booklets using ADF (Automatic Document Feeder) scanners.
2. **Web/Desktop Evaluation Application** — For on-screen evaluation of scanned answer sheets by evaluators.

### 1.2 Scope

- Pre-examination logistics (schedule, fees, hall tickets, centres) are out of scope.
- Question paper preparation (jumbling, multiple sets) may integrate later via separate module.
- Focus: Answer booklet scanning, storage, evaluation workflow, and reporting.

### 1.2.1 Web and desktop presentation (informative)

The **web application** (React) uses a **Material indigo** visual system aligned with the **Windows scanner desktop** app (`#3F51B5` / `#303F9F` primary, `#F5F7FA` surfaces) so operators and evaluators see a consistent brand across clients.

### 1.3 Definitions

| Term | Definition |
|------|------------|
| **Booklet** | Physical answer booklet containing student responses; identified by unique ID (barcode/QR). |
| **ADF** | Automatic Document Feeder — scanner hardware for batch scanning. |
| **Primary Evaluation** | First evaluation of a booklet by an assigned evaluator. |
| **Secondary Evaluation** | Re-evaluation (random or flagged) for quality control. |
| **Variance** | Difference between primary and secondary marks; triggers moderation if above threshold. |

---

## 2. System Components

### 2.1 Desktop Scanning Software

| ID | Requirement | Priority | Description |
|----|-------------|----------|-------------|
| SCN-001 | Scanner Selection | Must | Support selection of ADF-capable scanner(s); multi-scanner environments. |
| SCN-002 | Scan Parameters | Must | Configurable DPI (150/200/300), color tone (color/gray/B&W), page size (A4/legal), simplex/duplex. |
| SCN-003 | Scan to Folder | Must | Save scanned images to configurable output folder. |
| SCN-004 | File Naming by Barcode | Must | Extract booklet ID from front-page barcode/QR; use as filename and BookletID. |
| SCN-005 | Per-Page Barcode | Should | Read barcode on each page for page ordering and integrity verification. |
| SCN-006 | Page Count Validation | Must | Compare TotalPagesScanned vs TotalPagesExpected; flag mismatches. |
| SCN-007 | Each Page Check | Must | Validate each scanned page (readable, not blank, correct sequence). |
| SCN-008 | Workstation & Date | Must | Record workstation ID and scan date for audit. |
| SCN-009 | Scanning Centre Selection | Must | User selects location/centre before or at scan start. |
| SCN-010 | Duplicate Detection | Must | Prevent re-scanning of same BookletID. |
| SCN-011 | SHA-256 Integrity | Should | Generate file hash for booklet and pages; detect tampering. |
| SCN-012 | Export to Evaluation | Must | Mark booklet as exported; push to EvaluationDB (sync). |
| SCN-013 | Day/User Productivity | Should | Track scanning volume per day and per user. |
| SCN-014 | Network Within Location | Must | Operate on LAN; local MySQL for scanning DB. |
| SCN-015 | Web Admin | Should | Web interface for location creation, user creation, productivity views. |

### 2.2 Web/Desktop Evaluation Application

| ID | Requirement | Priority | Description |
|----|-------------|----------|-------------|
| EVL-001 | Dashboard Summary | Must | Cards: Total Answer Sheets, Evaluated, Pending, Rejected. |
| EVL-002 | Pending Review Table | Must | Table: Document No., UG/PG, Branch, Year, Semester, Subject, Marks, Status (Open/Evaluated/Recheck). |
| EVL-003 | Document Viewer | Must | Thumbnail navigation, main view, zoom, rotate, page navigation. |
| EVL-004 | Marks Sheet Panel | Must | Table: Page No., Q. No., Max Marks, Allotted Marks; auto-total. |
| EVL-005 | Question Paper Access | Must | Button to open question paper and model answers (linked by PaperID). |
| EVL-006 | Annotation Tools | Must | Checkmark, cross, underline, highlight, freehand; optional comments. |
| EVL-007 | Every Page Visit | Must | Enforce that evaluator views every page before submit; log page visits. |
| EVL-008 | Total Marks Validation | Must | Prevent allotted total > max allowed marks. |
| EVL-009 | Timer / Session Metrics | Should | Track time per booklet; display elapsed/remaining. |
| EVL-010 | Evaluator Login | Must | OTP, biometric, or facial auth (OTP minimum for MVP). |
| EVL-011 | Evaluation Centres | Must | Multi-location; evaluators assigned to centres. |
| EVL-012 | Evaluator Roles | Must | Hierarchical roles by subject/category. |
| EVL-013 | Allocation Queue | Must | Assign booklets to evaluators; track allocation type (Primary/Secondary). |
| EVL-014 | Secondary Evaluation | Must | Random % + time-based flagging; compare marks; variance threshold. |
| EVL-015 | De-roster | Must | Admin can deactivate evaluators. |
| EVL-016 | Booklets per Session/Day | Should | Configurable daily limit per evaluator. |
| EVL-017 | Charges | Could | Track evaluation charges per booklet/evaluator. |

**Shipped web behaviours (see codebase for details):**

- **Session setup (evaluators):** After login, evaluators may be required to share **geolocation**, capture a **live photo**, and **match face** to the administrator-registered profile image before accessing the dashboard (supports EVL-010 / audit goals).
- **Head Evaluator portal:** Web routes for head-eval login and **bulk assignment** of booklets to evaluators (`/head-eval/*`).
- **Shared booklet stamps:** Booklet-level annotation stamps (e.g. blank or crossed page markers) may be stored in **`Eval_BookletSharedAnnotations`** and shared across primary/secondary/moderation viewers (see `16_eval_booklet_shared_annotations.sql`).

### 2.3 Check-for Rules (Quality Control)

| ID | Check | Description |
|----|-------|-------------|
| CHK-001 | Same Answer for Multiple Questions | Detect identical answers across different questions; flag for review. |
| CHK-002 | Answer Spreading | Manage/flag answers spanning non-contiguous pages. |
| CHK-003 | Missing Question # | Alert if answer block has no explicit question number. |
| CHK-004 | Partial Answers | Allow partial marks; support in marking scheme. |
| CHK-005 | Answer Structure | Sub-criteria: Content, Formula, Images, Process, Result (configurable per paper). |
| CHK-006 | Every Page Visit | System enforces all pages viewed before submit. |
| CHK-007 | Total ≤ Max Marks | Validation: allotted total cannot exceed max. |

### 2.4 MIS Reports

| ID | Report | Dimensions |
|----|--------|------------|
| MIS-001 | Day-wise | Scanning/evaluation volume by date |
| MIS-002 | Location-wise | By scanning/evaluation centre |
| MIS-003 | Subject-wise | By paper/subject |
| MIS-004 | Evaluator-wise | Count and performance per evaluator |
| MIS-005 | Time per Session | Session duration per evaluator |
| MIS-006 | Avg Time per Booklet | Average evaluation time per booklet |
| MIS-007 | Evaluator Attendance | Present, Absent, Suspended, De-Roster |

### 2.5 Push to Central Server

| ID | Requirement | Description |
|----|-------------|-------------|
| SYNC-001 | Sync | Incremental sync of new/changed data to central MySQL |
| SYNC-002 | Replicate | Data replication for redundancy and load balancing |
| SYNC-003 | Queue-Based | Use sync queue; retry on failure |

---

## 3. Non-Functional Requirements

| ID | Category | Requirement |
|----|----------|-------------|
| NFR-001 | Performance | Scan and save < 5 sec per page (typical ADF). |
| NFR-002 | Performance | Evaluation UI load < 2 sec for first page. |
| NFR-003 | Availability | Local scanning works offline; sync when network available. |
| NFR-004 | Security | Passwords hashed (bcrypt/argon2); audit logs for all mutations. |
| NFR-005 | Compliance | Support UTF-8 (vernacular scripts). |
| NFR-006 | Scalability | Support 1000+ booklets per day per location. |
| NFR-007 | Testability (web) | Key flows can be smoke-tested with **Playwright** (`web/e2e/`) against the API and Vite or Docker-served web. |

---

## 4. User Roles

| Role | Scanning | Evaluation |
|------|----------|------------|
| Admin | Manage locations, users, workstations | Same; manage evaluators, allocation |
| Scanner Operator | Scan booklets, select centre | — |
| Evaluator | — | Evaluate assigned booklets |
| Moderator | — | Resolve variance, override marks |
| Viewer | — | MIS reports (read-only) |

---

## 5. Data Flow

1. **Scan**: Operator selects exam, paper, centre, workstation → scans booklet → barcode read → pages validated → saved to ScanningDB → (optionally) pushed to central.
2. **Sync**: Local ScanningDB → Sync Queue → Central MySQL (EvaluationDB or mirror).
3. **Evaluation**: Scanned data is available in **EvaluationDB** (sync/export per deployment). A booklet must be **allocated** to an evaluator (e.g. **Head Evaluator** assignment or allocation queue) before it appears on the evaluator dashboard. The evaluator opens the booklet → views pages → enters marks → submits → status = Evaluated.
4. **Secondary**: System selects booklets (random or time-flagged) → allocates to different evaluator → variance compared → moderation if needed.

---

## 6. Assumptions and Dependencies

- Answer booklets have unique barcode/QR on front page; optionally per page.
- Standard page counts: 12/24/36 per booklet type.
- MySQL 8+ available locally and centrally.
- ADF scanners support TWAIN or WIA.
- Network connectivity for sync (may be intermittent).

---

## 7. Out of Scope (Current Phase)

- Question paper generation (jumbling, multiple sets).
- Hall ticket / fee collection.
- ADFS (Active Directory Federation Services) — can be added later for SSO.
- AI-based auto-scoring (future phase).

---

## 8. Traceability Matrix

| Requirement | DDL / implementation notes |
|-------------|------------|
| SCN-004, SCN-005 | `Scan_Booklets.BookletID`, `Scan_BookletPages.BarcodeData` |
| SCN-006, SCN-007 | `Scan_Booklets.TotalPagesExpected` / `TotalPagesScanned`, `Scan_BookletPages.ValidationStatus` |
| SCN-008, SCN-009 | `Scan_Booklets.WorkstationID`, `ScanDate`, `LocationID` |
| EVL-004 | `EvaluationDetails`, `Eval_QuestionScheme` |
| EVL-006 (annotations) | `Eval_Annotations` (per-evaluation), `Eval_BookletSharedAnnotations` (booklet-level shared stamps) |
| EVL-007 | `Eval_PageVisitLog`, `Evaluations.AllPagesVisited` |
| EVL-010 (identity) | `Users.ProfilePhotoPath`, session/login photo API; client-side face match |
| EVL-013 | `AllocationQueue`, `Eval_Booklets.EvaluationStatus` |
| EVL-014 | `VarianceRecords`, `Eval_Papers.VarianceThresholdPercent` |
| MIS-007 | `Eval_AttendanceLog` |
| Zone / barcode scheduling | Migrations in `15_zone_barcode_upload_schedule.sql` (ScanningDB) |
| SYNC | `Scan_SyncQueue` (where enabled) |

---

## 9. Document history

| Version | Date | Notes |
|---------|------|--------|
| 1.0 | 2026-02-19 | Initial formal specification. |
| 1.1 | 2026-04-21 | Web/desktop UI alignment; evaluator session and Head Evaluator notes; `Eval_BookletSharedAnnotations` and migration references; Playwright (NFR-007); evaluation allocation clarified in data flow. |
