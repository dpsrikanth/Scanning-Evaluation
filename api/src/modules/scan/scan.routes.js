import { Router } from 'express';
import ScanRepository from './scan.repository.js';
import ScanService from './scan.service.js';
import ScanController from './scan.controller.js';
import { getScanDb } from '../../config/database.js';
import { authenticate, authorize } from '../../middleware/auth.js';
import ScanQcRepository from '../scanqc/scanqc.repository.js';
import ScanQcService from '../scanqc/scanqc.service.js';
import ScanQcController from '../scanqc/scanqc.controller.js';
import auditLog from '../../middleware/auditLog.js';
import { scanLimiter } from '../../middleware/security.js';
import { uploadBookletPdf } from '../../middleware/upload.js';

const router = Router();

const repo = new ScanRepository(getScanDb());
const service = new ScanService(repo);
const controller = new ScanController(service);
const qcRepo = new ScanQcRepository(getScanDb());
const qcService = new ScanQcService(repo, qcRepo);
const qcController = new ScanQcController(qcService);

router.use(authenticate);
router.use(auditLog('scan'));
router.use(scanLimiter);

/**
 * @openapi
 * /api/scan/settings:
 *   get:
 *     tags: [Scan]
 *     summary: Fetch scanning settings for the desktop app
 *     description: |
 *       Returns the location, active exams, papers with page-count configurations,
 *       assigned workstations, and default scanner parameters for the authenticated
 *       scan-user's location.
 *     responses:
 *       200:
 *         description: Scan settings payload
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/ScanSettings'
 *       401:
 *         description: Unauthorised
 */
router.get('/settings', controller.getSettings);

/**
 * @openapi
 * /api/scan/barcode/{barcodeValue}:
 *   get:
 *     tags: [Scan]
 *     summary: Lookup booklet by first-page barcode
 *     description: |
 *       Decodes the barcode read from the first page of the answer booklet and
 *       returns the associated exam, paper, and expected page count.
 *     parameters:
 *       - in: path
 *         name: barcodeValue
 *         required: true
 *         schema: { type: string }
 *         description: Raw barcode string from the first scanned page
 *         example: 110293000124
 *     responses:
 *       200:
 *         description: Barcode resolved to booklet info
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         bookletId: { type: string }
 *                         examId: { type: integer }
 *                         paperId: { type: integer }
 *                         expectedPages: { type: integer }
 *       404:
 *         description: Barcode not found / not registered
 */
router.get('/barcode/:barcodeValue', controller.lookupBarcode);

/**
 * Multipart booklet + PDF upload — registered BEFORE /booklet/:bookletId so "upload" is never captured as a bookletId.
 * Primary path: POST /api/scan/booklet-upload (recommended for scanner-desktop).
 * Alias: POST /api/scan/booklet/upload
 */
router.post('/booklet-upload', uploadBookletPdf, controller.saveBookletWithPdf);
router.post('/booklet/upload', uploadBookletPdf, controller.saveBookletWithPdf);

/**
 * @openapi
 * /api/scan/booklet/{bookletId}:
 *   get:
 *     tags: [Scan]
 *     summary: Get scan status for a booklet
 *     description: Returns scan header and page list for a previously scanned booklet.
 *     parameters:
 *       - in: path
 *         name: bookletId
 *         required: true
 *         schema: { type: string }
 *         example: 110293000124
 *     responses:
 *       200:
 *         description: Booklet scan data
 *       404:
 *         description: Booklet not found
 */
router.get('/booklet/:bookletId', controller.getBookletInfo);

/**
 * @openapi
 * /api/scan/booklet:
 *   post:
 *     tags: [Scan]
 *     summary: Save a newly scanned booklet
 *     description: |
 *       Persists the booklet header plus all individual page records.
 *       Called by the .NET desktop app after scanning is complete and
 *       images have been saved locally.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/SaveBookletRequest'
 *     responses:
 *       201:
 *         description: Booklet saved successfully
 *       400:
 *         description: Validation error
 *       409:
 *         description: Booklet already exists
 */
router.post('/booklet', controller.saveBooklet);

/**
 * @openapi
 * /api/scan/productivity:
 *   get:
 *     tags: [Scan]
 *     summary: Get productivity stats for the current scan session
 *     description: Returns count of booklets scanned today per operator and workstation.
 *     responses:
 *       200:
 *         description: Productivity stats
 */
router.get('/productivity', controller.getProductivity);

/**
 * @openapi
 * /api/scan/booklets:
 *   get:
 *     tags: [Scan]
 *     summary: List scanned booklets
 *     description: Returns a paged list of booklets scanned at this location.
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 50 }
 *       - in: query
 *         name: paperId
 *         schema: { type: integer }
 *       - in: query
 *         name: date
 *         schema: { type: string, format: date }
 *     responses:
 *       200:
 *         description: List of scanned booklets
 */
router.get('/booklets', controller.getBookletList);

/**
 * @openapi
 * /api/scan/my-workstation:
 *   get:
 *     tags: [Scan]
 *     summary: Get workstation assigned to the logged-in operator
 *     description: Returns the workstation (with printer profile) assigned to the current user's username.
 *     responses:
 *       200:
 *         description: Assigned workstation info or null
 */
router.get('/my-workstation', controller.getMyWorkstation);

/**
 * @openapi
 * /api/scan/templates:
 *   get:
 *     tags: [Scan]
 *     summary: List all active scan templates
 *     responses:
 *       200:
 *         description: Array of scan templates
 */
router.get('/templates', controller.getTemplates);

/**
 * @openapi
 * /api/scan/printer-profiles:
 *   get:
 *     tags: [Scan]
 *     summary: List all active printer profiles
 *     responses:
 *       200:
 *         description: Array of printer profiles
 */
router.get('/printer-profiles', controller.getPrinterProfiles);

// ── QC (scan JWT: VendorQC / CustomerQC / Operator) ───────────────────────────
router.get('/rejected-booklets', authorize('Operator', 'Admin'), qcController.listRejected);
router.get('/qc/vendor/lots', authorize('VendorQC', 'Admin'), qcController.listVendorLots);
router.get('/qc/vendor/lot-booklets', authorize('VendorQC', 'Admin'), qcController.listVendorLotBooklets);
router.post('/qc/vendor/booklets/:bookletId/decision', authorize('VendorQC', 'Admin'), qcController.vendorDecide);
router.post('/qc/vendor/lots/approve', authorize('VendorQC', 'Admin'), qcController.approveVendorLot);
router.get('/qc/customer/lots', authorize('CustomerQC', 'Admin'), qcController.listCustomerLots);
router.get('/qc/customer/lot-booklets', authorize('CustomerQC', 'Admin'), qcController.listCustomerLotBooklets);
router.post('/qc/customer/booklets/:bookletId/decision', authorize('CustomerQC', 'Admin'), qcController.customerDecide);
router.post('/qc/customer/lots/approve', authorize('CustomerQC', 'Admin'), qcController.approveCustomerLot);

export default router;
