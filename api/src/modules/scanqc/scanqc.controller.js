import { ok } from '../../utils/response.js';

export default class ScanQcController {
  constructor(scanQcService) {
    this.svc = scanQcService;
  }

  listVendorLots = async (req, res, next) => {
    try {
      const data = await this.svc.listVendorLots(req, req.query);
      return ok(res, data);
    } catch (e) {
      next(e);
    }
  };

  listVendorLotBooklets = async (req, res, next) => {
    try {
      const data = await this.svc.listVendorLotBooklets(req, req.query);
      return ok(res, data);
    } catch (e) {
      next(e);
    }
  };

  vendorDecide = async (req, res, next) => {
    try {
      const data = await this.svc.vendorDecide(req, req.params.bookletId, req.body || {});
      return ok(res, data, 'Vendor QC updated');
    } catch (e) {
      next(e);
    }
  };

  approveVendorLot = async (req, res, next) => {
    try {
      const data = await this.svc.approveVendorLot(req, req.body || {});
      return ok(res, data, 'Vendor lot approved');
    } catch (e) {
      next(e);
    }
  };

  listCustomerLots = async (req, res, next) => {
    try {
      const data = await this.svc.listCustomerLots(req, req.query);
      return ok(res, data);
    } catch (e) {
      next(e);
    }
  };

  listCustomerLotBooklets = async (req, res, next) => {
    try {
      const data = await this.svc.listCustomerLotBooklets(req, req.query);
      return ok(res, data);
    } catch (e) {
      next(e);
    }
  };

  customerDecide = async (req, res, next) => {
    try {
      const data = await this.svc.customerDecide(req, req.params.bookletId, req.body || {});
      return ok(res, data, 'Customer QC updated');
    } catch (e) {
      next(e);
    }
  };

  approveCustomerLot = async (req, res, next) => {
    try {
      const data = await this.svc.approveCustomerLot(req, req.body || {});
      return ok(res, data, 'Customer lot approved');
    } catch (e) {
      next(e);
    }
  };

  listRejected = async (req, res, next) => {
    try {
      const data = await this.svc.listRejectedForOperator(req);
      return ok(res, data);
    } catch (e) {
      next(e);
    }
  };
}
