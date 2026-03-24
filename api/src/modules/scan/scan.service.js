export default class ScanService {
  constructor(scanRepository) {
    this.repo = scanRepository;
  }

  async getSettings(locationId) {
    if (!locationId) {
      throw Object.assign(new Error('locationId is required'), { statusCode: 400 });
    }
    return this.repo.getScanSettings(locationId);
  }

  async lookupBarcode(barcodeValue) {
    if (!barcodeValue) {
      throw Object.assign(new Error('barcodeValue is required'), { statusCode: 400 });
    }

    const existing = await this.repo.lookupBookletByBarcode(barcodeValue);

    if (existing && existing.TotalPagesScanned > 0) {
      throw Object.assign(
        new Error(`Booklet ${barcodeValue} already scanned (${existing.TotalPagesScanned} pages). Duplicate detected.`),
        { statusCode: 409 }
      );
    }

    return {
      bookletId: barcodeValue,
      alreadyExists: !!existing,
      expectedPages: existing?.TotalPagesExpected || null,
      validationStatus: existing?.ValidationStatus || null,
    };
  }

  async getBookletInfo(bookletId) {
    const info = await this.repo.getBookletExpectedPages(bookletId);
    if (!info) {
      throw Object.assign(new Error(`Booklet ${bookletId} not found`), { statusCode: 404 });
    }
    return {
      bookletId: info.BookletID,
      examCode: info.ExamCode,
      examName: info.ExamName,
      paperCode: info.PaperCode,
      paperName: info.PaperName,
      expectedPages: info.TotalPagesExpected,
      bookletPageCounts: info.BookletPageCounts,
    };
  }

  async saveScannedBooklet(bookletData, pages) {
    if (!bookletData.bookletId) {
      throw Object.assign(new Error('bookletId is required'), { statusCode: 400 });
    }

    // Normalise numeric IDs (multipart / JSON may send strings)
    const num = (v) => {
      const n = Number(v);
      return Number.isFinite(n) && n > 0 ? n : 0;
    };
    bookletData.examId = num(bookletData.examId);
    bookletData.paperId = num(bookletData.paperId);
    bookletData.locationId = num(bookletData.locationId);

    // Fallback 1: explicit examCode + paperCode from desktop queue (barcode metadata)
    if (!bookletData.examId || !bookletData.paperId) {
      const ec = bookletData.examCode != null ? String(bookletData.examCode).trim() : '';
      const pc = bookletData.paperCode != null ? String(bookletData.paperCode).trim() : '';
      if (ec && pc) {
        const byCodes = await this.repo.resolveExamAndPaperFromCodes(ec, pc);
        if (byCodes) {
          bookletData.examId = bookletData.examId || byCodes.examId;
          bookletData.paperId = bookletData.paperId || byCodes.paperId;
        }
      }
    }

    // Fallback 2: bookletId prefix EXAMCODE_PAPERCODE_...
    if (!bookletData.examId || !bookletData.paperId) {
      const resolved = await this.repo.resolveExamAndPaperFromBookletId(bookletData.bookletId);
      if (resolved) {
        bookletData.examId = bookletData.examId || resolved.examId;
        bookletData.paperId = bookletData.paperId || resolved.paperId;
      }
    }

    // Validate required FK fields are present
    if (!bookletData.examId) {
      throw Object.assign(new Error('examId is required — select exam/paper in scanner-desktop, or ensure booklet ID / examCode+paperCode match Scan_Exams / Scan_Papers.'), { statusCode: 400 });
    }
    if (!bookletData.paperId) {
      throw Object.assign(new Error('paperId is required — select exam/paper in scanner-desktop, or ensure booklet ID / examCode+paperCode match the server.'), { statusCode: 400 });
    }
    if (!bookletData.locationId) {
      throw Object.assign(new Error('locationId is required — workstation may not be registered on the server'), { statusCode: 400 });
    }

    const pageCountValid = bookletData.totalPagesScanned === bookletData.totalPagesExpected;
    bookletData.validationStatus = pageCountValid ? 'Valid' : 'PageCountMismatch';

    const qc = await this.repo.getLocationQcSettings(bookletData.locationId);
    const vEn = Number(qc.VendorQcEnabled) !== 0;
    const cEn = Number(qc.CustomerQcEnabled) !== 0;
    bookletData.vendorQcAt = null;
    bookletData.vendorQcByUserId = null;
    bookletData.vendorQcReason = null;
    bookletData.customerQcAt = null;
    bookletData.customerQcByUserId = null;
    bookletData.customerQcReason = null;
    if (vEn) {
      bookletData.vendorQcStatus = 'Pending';
      bookletData.customerQcStatus = null;
    } else {
      bookletData.vendorQcStatus = 'Skipped';
      bookletData.customerQcStatus = cEn ? 'Pending' : 'Skipped';
    }
    if (!cEn) {
      bookletData.customerQcStatus = 'Skipped';
    }

    let wasReupload = false;
    try {
      const result = await this.repo.createBooklet(bookletData);
      // affectedRows === 2 means ON DUPLICATE KEY UPDATE fired (MySQL reports 2 for update)
      wasReupload = result.affectedRows === 2;
    } catch (dbErr) {
      if (dbErr.code === 'ER_NO_REFERENCED_ROW_2') {
        throw Object.assign(
          new Error(
            `Database constraint error: one of ExamID (${bookletData.examId}), ` +
            `PaperID (${bookletData.paperId}), LocationID (${bookletData.locationId}), ` +
            `or WorkstationID (${bookletData.workstationId}) does not exist on the server. ` +
            `Check that the scan template, exam, and workstation are configured correctly.`
          ),
          { statusCode: 422 }
        );
      }
      throw Object.assign(
        new Error(`Database error saving booklet: ${dbErr.message}`),
        { statusCode: 500 }
      );
    }

    for (const page of pages) {
      page.bookletId = bookletData.bookletId;
      page.createdBy = bookletData.createdBy;
      page.createdFromIP = bookletData.createdFromIP;
      page.createdFromSystem = bookletData.createdFromSystem;
      await this.repo.createBookletPage(page);
    }

    try {
      await this.repo.enqueueSyncBooklet(bookletData.bookletId);
    } catch {
      // Non-fatal — sync queue insert failure doesn't break the upload
    }

    return {
      bookletId: bookletData.bookletId,
      totalPagesScanned: bookletData.totalPagesScanned,
      validationStatus: bookletData.validationStatus,
      note: wasReupload ? 'Reupload — existing record updated' : undefined,
    };
  }

  async getProductivity(locationId, scanDate) {
    return this.repo.getProductivitySummary(locationId, scanDate);
  }

  async getBookletList(locationId, scanDate) {
    return this.repo.getBookletsByDate(locationId, scanDate);
  }

  async getMyWorkstation(username) {
    return this.repo.getMyWorkstation(username);
  }

  async getTemplates() {
    return this.repo.getTemplates();
  }

  async getPrinterProfiles() {
    return this.repo.getPrinterProfiles();
  }
}
