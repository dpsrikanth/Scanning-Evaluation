function toDateOnly(d) {
  if (d == null) return null;
  const s = String(d);
  return s.includes('T') ? s.slice(0, 10) : s.slice(0, 10);
}

export default class ScanQcService {
  constructor(scanRepository, scanQcRepository) {
    this.scanRepo = scanRepository;
    this.qcRepo = scanQcRepository;
  }

  assertScanUser(req) {
    if (req.user?.source !== 'scan') {
      const err = new Error('Scan portal login required');
      err.statusCode = 403;
      throw err;
    }
  }

  resolveLocationId(req, queryLocationId) {
    const lid = queryLocationId != null && queryLocationId !== ''
      ? parseInt(queryLocationId, 10)
      : parseInt(req.user?.locationId, 10);
    if (!Number.isFinite(lid) || lid < 1) {
      const err = new Error('Valid locationId required');
      err.statusCode = 400;
      throw err;
    }
    if (lid !== parseInt(req.user?.locationId, 10)) {
      const err = new Error('Cannot access another location');
      err.statusCode = 403;
      throw err;
    }
    return lid;
  }

  async listVendorLots(req, query) {
    this.assertScanUser(req);
    const locationId = this.resolveLocationId(req, query.locationId);
    return this.qcRepo.listVendorLotSummaries(locationId, {
      paperId: query.paperId,
      lotDate: query.date || query.lotDate,
    });
  }

  async listVendorLotBooklets(req, query) {
    this.assertScanUser(req);
    const locationId = this.resolveLocationId(req, query.locationId);
    const paperId = parseInt(query.paperId, 10);
    const lotDate = query.lotDate || query.date;
    if (!Number.isFinite(paperId) || !lotDate) {
      const err = new Error('paperId and lotDate are required');
      err.statusCode = 400;
      throw err;
    }
    return this.qcRepo.listVendorLotBooklets(locationId, paperId, lotDate);
  }

  async vendorDecide(req, bookletId, body) {
    this.assertScanUser(req);
    const status = body?.status;
    if (!['Approved', 'Rejected'].includes(status)) {
      const err = new Error('status must be Approved or Rejected');
      err.statusCode = 400;
      throw err;
    }
    const meta = await this.scanRepo.getBookletScanMeta(bookletId);
    if (!meta) {
      const err = new Error('Booklet not found');
      err.statusCode = 404;
      throw err;
    }
    const locationId = this.resolveLocationId(req, null);
    if (meta.LocationID !== locationId) {
      const err = new Error('Booklet not in your location');
      err.statusCode = 403;
      throw err;
    }
    const userId = req.user.userId;
    await this.qcRepo.setVendorDecision(bookletId, userId, status, body?.reason ?? null);

    if (status === 'Approved') {
      const loc = await this.scanRepo.getLocationQcSettings(locationId);
      if (Number(loc.CustomerQcEnabled)) {
        const vEn = Number(loc.VendorQcEnabled) !== 0;
        const lot = await this.qcRepo.getDailyLot(locationId, meta.PaperID, toDateOnly(meta.ScanDate));
        const lotOk = !vEn || (lot && lot.VendorApprovedAt);
        if (lotOk) {
          await this.qcRepo.pushCustomerPending(bookletId);
        }
      }
    }
    return { bookletId, vendorQcStatus: status };
  }

  async approveVendorLot(req, body) {
    this.assertScanUser(req);
    const locationId = this.resolveLocationId(req, body.locationId);
    const paperId = parseInt(body.paperId, 10);
    const lotDate = body.lotDate;
    if (!Number.isFinite(paperId) || !lotDate) {
      const err = new Error('paperId and lotDate are required');
      err.statusCode = 400;
      throw err;
    }
    const userId = req.user.userId;
    await this.qcRepo.upsertVendorLotApproval(locationId, paperId, lotDate, userId);
    await this.qcRepo.setCustomerPendingForLotAfterVendorApproval(locationId, paperId, lotDate);
    return { locationId, paperId, lotDate, vendorLotApproved: true };
  }

  async listCustomerLots(req, query) {
    this.assertScanUser(req);
    const locationId = this.resolveLocationId(req, query.locationId);
    const loc = await this.scanRepo.getLocationQcSettings(locationId);
    const vendorQcEnabled = Number(loc.VendorQcEnabled) !== 0;
    return this.qcRepo.listCustomerLotSummaries(
      locationId,
      { paperId: query.paperId, lotDate: query.date || query.lotDate },
      vendorQcEnabled
    );
  }

  async listCustomerLotBooklets(req, query) {
    this.assertScanUser(req);
    const locationId = this.resolveLocationId(req, query.locationId);
    const loc = await this.scanRepo.getLocationQcSettings(locationId);
    const vendorQcEnabled = Number(loc.VendorQcEnabled) !== 0;
    const paperId = parseInt(query.paperId, 10);
    const lotDate = query.lotDate || query.date;
    if (!Number.isFinite(paperId) || !lotDate) {
      const err = new Error('paperId and lotDate are required');
      err.statusCode = 400;
      throw err;
    }
    return this.qcRepo.listCustomerLotBooklets(locationId, paperId, lotDate, vendorQcEnabled);
  }

  async customerDecide(req, bookletId, body) {
    this.assertScanUser(req);
    const status = body?.status;
    if (!['Approved', 'Rejected'].includes(status)) {
      const err = new Error('status must be Approved or Rejected');
      err.statusCode = 400;
      throw err;
    }
    const meta = await this.scanRepo.getBookletScanMeta(bookletId);
    if (!meta) {
      const err = new Error('Booklet not found');
      err.statusCode = 404;
      throw err;
    }
    const locationId = this.resolveLocationId(req, null);
    if (meta.LocationID !== locationId) {
      const err = new Error('Booklet not in your location');
      err.statusCode = 403;
      throw err;
    }
    const userId = req.user.userId;
    await this.qcRepo.setCustomerDecision(bookletId, userId, status, body?.reason ?? null);
    return { bookletId, customerQcStatus: status };
  }

  async approveCustomerLot(req, body) {
    this.assertScanUser(req);
    const locationId = this.resolveLocationId(req, body.locationId);
    const paperId = parseInt(body.paperId, 10);
    const lotDate = body.lotDate;
    if (!Number.isFinite(paperId) || !lotDate) {
      const err = new Error('paperId and lotDate are required');
      err.statusCode = 400;
      throw err;
    }
    const userId = req.user.userId;
    await this.qcRepo.upsertCustomerLotApproval(locationId, paperId, lotDate, userId);
    return { locationId, paperId, lotDate, customerLotApproved: true };
  }

  async listRejectedForOperator(req) {
    this.assertScanUser(req);
    const locationId = this.resolveLocationId(req, null);
    return this.qcRepo.listRejectedForOperator(locationId);
  }
}
