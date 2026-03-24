import { getScanDb } from '../config/database.js';
import ScanRepository from '../modules/scan/scan.repository.js';

const scanRepo = new ScanRepository(getScanDb());
const ROLES = new Set(['VendorQC', 'CustomerQC', 'Operator']);

/**
 * For scan-sourced JWTs, restrict booklet file access to the booklet's LocationID.
 * Eval-sourced tokens pass through unchanged.
 */
export default async function enforceScanBookletLocationAccess(req, res, next) {
  try {
    if (req.user?.source !== 'scan') return next();
    if (!ROLES.has(req.user.roleName)) return next();

    const bookletId = req.params.bookletId;
    if (!bookletId || String(bookletId).includes('..')) {
      return res.status(400).json({ success: false, message: 'Invalid booklet ID' });
    }

    const meta = await scanRepo.getBookletScanMeta(bookletId);
    if (!meta) {
      return res.status(404).json({ success: false, message: 'Booklet not found' });
    }
    const uid = parseInt(req.user.locationId, 10);
    const bid = parseInt(meta.LocationID, 10);
    if (uid !== bid) {
      return res.status(403).json({ success: false, message: 'Booklet not in your location' });
    }
    return next();
  } catch (err) {
    return next(err);
  }
}
