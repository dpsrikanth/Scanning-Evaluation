import bcrypt from 'bcryptjs';

const MANAGEABLE_SCAN_ROLE_NAMES = new Set(['Admin', 'Operator', 'VendorQC', 'CustomerQC']);

export default class ScanAdminService {
  constructor(repo) {
    this.repo = repo;
  }

  async #assertManageableScanRole(roleId) {
    const id = parseInt(roleId, 10);
    if (!Number.isFinite(id) || id < 1) {
      throw Object.assign(new Error('roleId is required'), { statusCode: 400 });
    }
    const role = await this.repo.getScanRoleById(id);
    if (!role || !MANAGEABLE_SCAN_ROLE_NAMES.has(role.RoleName)) {
      throw Object.assign(new Error('Invalid role — use Admin, Operator, VendorQC, or CustomerQC'), { statusCode: 400 });
    }
    return role;
  }

  // ── Exams ────────────────────────────────────────────────────────────────

  async listExams() {
    return this.repo.listExams();
  }

  async getExam(examId) {
    const exam = await this.repo.getExam(examId);
    if (!exam) throw Object.assign(new Error('Exam not found'), { statusCode: 404 });
    return exam;
  }

  async createExam(data) {
    if (!data.examCode || !data.examName) {
      throw Object.assign(new Error('examCode and examName are required'), { statusCode: 400 });
    }
    const id = await this.repo.createExam(data);
    return this.repo.getExam(id);
  }

  async updateExam(examId, data) {
    await this.getExam(examId);
    await this.repo.updateExam(examId, data);
    return this.repo.getExam(examId);
  }

  async deleteExam(examId, deletedBy) {
    await this.getExam(examId);
    await this.repo.deleteExam(examId, deletedBy);
  }

  // ── Papers ───────────────────────────────────────────────────────────────

  async listPapers(examId) {
    return this.repo.listPapers(examId);
  }

  async getPaper(paperId) {
    const paper = await this.repo.getPaper(paperId);
    if (!paper) throw Object.assign(new Error('Paper not found'), { statusCode: 404 });
    return paper;
  }

  async createPaper(data) {
    if (!data.examId || !data.paperCode || !data.paperName) {
      throw Object.assign(new Error('examId, paperCode and paperName are required'), { statusCode: 400 });
    }
    const id = await this.repo.createPaper(data);
    return this.repo.getPaper(id);
  }

  async updatePaper(paperId, data) {
    await this.getPaper(paperId);
    await this.repo.updatePaper(paperId, data);
    return this.repo.getPaper(paperId);
  }

  async deletePaper(paperId, deletedBy) {
    await this.getPaper(paperId);
    await this.repo.deletePaper(paperId, deletedBy);
  }

  // ── Workstations ─────────────────────────────────────────────────────────

  async listWorkstations(locationId) {
    return this.repo.listWorkstations(locationId);
  }

  async getWorkstation(workstationId) {
    const ws = await this.repo.getWorkstation(workstationId);
    if (!ws) throw Object.assign(new Error('Workstation not found'), { statusCode: 404 });
    return ws;
  }

  async createWorkstation(data) {
    if (!data.locationId || !data.workstationCode || !data.workstationName) {
      throw Object.assign(new Error('locationId, workstationCode and workstationName are required'), { statusCode: 400 });
    }
    const id = await this.repo.createWorkstation(data);
    return this.repo.getWorkstation(id);
  }

  async updateWorkstation(workstationId, data) {
    await this.getWorkstation(workstationId);
    await this.repo.updateWorkstation(workstationId, data);
    return this.repo.getWorkstation(workstationId);
  }

  async deleteWorkstation(workstationId, deletedBy) {
    await this.getWorkstation(workstationId);
    await this.repo.deleteWorkstation(workstationId, deletedBy);
  }

  // ── Scan Templates ────────────────────────────────────────────────────────

  async listTemplates() {
    return this.repo.listTemplates();
  }

  async getTemplate(templateId) {
    const t = await this.repo.getTemplate(templateId);
    if (!t) throw Object.assign(new Error('Template not found'), { statusCode: 404 });
    return t;
  }

  async createTemplate(data) {
    if (!data.templateName || !data.pageCount) {
      throw Object.assign(new Error('templateName and pageCount are required'), { statusCode: 400 });
    }
    const id = await this.repo.createTemplate(data);
    return this.repo.getTemplate(id);
  }

  async updateTemplate(templateId, data) {
    await this.getTemplate(templateId);
    await this.repo.updateTemplate(templateId, data);
    return this.repo.getTemplate(templateId);
  }

  async deleteTemplate(templateId, deletedBy) {
    await this.getTemplate(templateId);
    await this.repo.deleteTemplate(templateId, deletedBy);
  }

  async saveTemplateImage(templateId, filePath) {
    await this.getTemplate(templateId); // ensures template exists
    await this.repo.saveTemplateImage(templateId, filePath);
  }

  async getTemplateImage(templateId) {
    await this.getTemplate(templateId);
    return this.repo.getTemplateImage(templateId);
  }

  // ── Printer Profiles ──────────────────────────────────────────────────────

  async listPrinterProfiles() {
    return this.repo.listPrinterProfiles();
  }

  async getPrinterProfile(profileId) {
    const p = await this.repo.getPrinterProfile(profileId);
    if (!p) throw Object.assign(new Error('Printer profile not found'), { statusCode: 404 });
    return p;
  }

  async createPrinterProfile(data) {
    if (!data.profileName || !data.brand) {
      throw Object.assign(new Error('profileName and brand are required'), { statusCode: 400 });
    }
    const id = await this.repo.createPrinterProfile(data);
    return this.repo.getPrinterProfile(id);
  }

  async updatePrinterProfile(profileId, data) {
    await this.getPrinterProfile(profileId);
    await this.repo.updatePrinterProfile(profileId, data);
    return this.repo.getPrinterProfile(profileId);
  }

  async deletePrinterProfile(profileId, deletedBy) {
    await this.getPrinterProfile(profileId);
    await this.repo.deletePrinterProfile(profileId, deletedBy);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  async listScannedBooklets(filters = {}) {
    return this.repo.listScannedBooklets(filters);
  }

  async listLocations() {
    return this.repo.listLocations();
  }

  async updateScanQcSettings({ locationId, vendorQcEnabled, customerQcEnabled }) {
    const id = parseInt(locationId, 10);
    if (!Number.isFinite(id) || id < 1) {
      throw Object.assign(new Error('locationId is required'), { statusCode: 400 });
    }
    const n = await this.repo.updateLocationQcToggles(
      id,
      vendorQcEnabled !== false && vendorQcEnabled !== 0 && vendorQcEnabled !== '0',
      customerQcEnabled !== false && customerQcEnabled !== 0 && customerQcEnabled !== '0'
    );
    if (!n) {
      throw Object.assign(new Error('Location not found'), { statusCode: 404 });
    }
    const all = await this.repo.listLocations();
    return all.find((l) => l.LocationID === id) || { LocationID: id };
  }

  async listScanUsers() {
    return this.repo.listScanUsers();
  }

  async listScanRolesForUserManagement() {
    return this.repo.listScanRolesForUserManagement();
  }

  async createScanUser(body, audit) {
    const username = String(body.username || '').trim();
    const fullName = String(body.fullName || '').trim();
    const password = body.password;
    const roleId = body.roleId;
    const locationId = body.locationId != null && body.locationId !== '' ? parseInt(body.locationId, 10) : null;

    if (!username || !fullName || !password) {
      throw Object.assign(new Error('username, fullName, and password are required'), { statusCode: 400 });
    }
    if (await this.repo.usernameExistsScan(username)) {
      throw Object.assign(new Error('Username already exists'), { statusCode: 409 });
    }
    await this.#assertManageableScanRole(roleId);

    const passwordHash = await bcrypt.hash(String(password), 10);
    const id = await this.repo.createScanUser({
      username,
      passwordHash,
      fullName,
      roleId: parseInt(roleId, 10),
      locationId: Number.isFinite(locationId) && locationId > 0 ? locationId : null,
      createdBy: audit.createdBy,
      createdFromIP: audit.createdFromIP,
      createdFromSystem: audit.createdFromSystem,
    });
    return this.repo.getScanUserById(id);
  }

  async updateScanUser(userId, body, audit) {
    const id = parseInt(userId, 10);
    if (!Number.isFinite(id) || id < 1) {
      throw Object.assign(new Error('Invalid user id'), { statusCode: 400 });
    }
    const existing = await this.repo.getScanUserById(id);
    if (!existing) throw Object.assign(new Error('Scan user not found'), { statusCode: 404 });

    const row = {
      modifiedBy: audit.modifiedBy,
      modifiedFromIP: audit.modifiedFromIP,
      modifiedFromSystem: audit.modifiedFromSystem,
    };

    if (body.fullName !== undefined) row.fullName = String(body.fullName).trim();
    if (body.roleId !== undefined) {
      await this.#assertManageableScanRole(body.roleId);
      row.roleId = parseInt(body.roleId, 10);
    }
    if (body.locationId !== undefined) {
      const lid = body.locationId != null && body.locationId !== '' ? parseInt(body.locationId, 10) : null;
      row.locationId = Number.isFinite(lid) && lid > 0 ? lid : null;
    }
    if (body.isActive !== undefined) {
      row.isActive = body.isActive === true || body.isActive === 1 || body.isActive === '1';
    }
    if (body.password != null && String(body.password).length > 0) {
      row.passwordHash = await bcrypt.hash(String(body.password), 10);
    }

    const n = await this.repo.updateScanUser(id, row);
    if (!n) throw Object.assign(new Error('Update failed'), { statusCode: 400 });
    return this.repo.getScanUserById(id);
  }

  async deleteScanUser(userId, audit) {
    const id = parseInt(userId, 10);
    if (!Number.isFinite(id) || id < 1) {
      throw Object.assign(new Error('Invalid user id'), { statusCode: 400 });
    }
    const existing = await this.repo.getScanUserById(id);
    if (!existing) throw Object.assign(new Error('Scan user not found'), { statusCode: 404 });
    const n = await this.repo.softDeleteScanUser(id, audit.deletedBy, audit.deletedFromIP);
    if (!n) throw Object.assign(new Error('Delete failed'), { statusCode: 400 });
  }

  // ── Scan output paths ─────────────────────────────────────────────────────

  async listOutputPaths() {
    const {
      checkPathAccessibility,
      resolveStoredScanPath,
      ensureScanOutputDirectory,
      countFilesUnderDirectory,
    } = await import('../scan/scanOutputPaths.js');
    let rows;
    try {
      rows = await this.repo.listOutputPaths();
    } catch {
      return [];
    }
    const cwd = process.cwd();
    return rows.map((r) => {
      const stored = (r.PathValue && String(r.PathValue).trim()) || '';
      if (stored) {
        try {
          ensureScanOutputDirectory(stored);
        } catch {
          /* list still returns row; accessibility reflects failure */
        }
      }
      const resolved = stored ? resolveStoredScanPath(stored) : null;
      const { accessible, error } = checkPathAccessibility(r.PathValue);
      const { fileCount, truncated } =
        accessible && resolved
          ? countFilesUnderDirectory(resolved)
          : { fileCount: 0, truncated: false };
      return {
        ...r,
        /** Absolute path used on this server (relative entries are resolved from serverWorkingDir) */
        resolvedPath: resolved,
        serverWorkingDir: cwd,
        isAccessible: accessible,
        accessibilityError: error || null,
        fileCount,
        fileCountTruncated: truncated,
      };
    });
  }

  async createOutputPath(data) {
    if (!data.pathLabel || !data.pathValue) {
      throw Object.assign(new Error('pathLabel and pathValue are required'), { statusCode: 400 });
    }
    const pathValue = String(data.pathValue).trim();
    const { ensureScanOutputDirectory } = await import('../scan/scanOutputPaths.js');
    ensureScanOutputDirectory(pathValue);
    const id = await this.repo.createOutputPath({
      pathLabel: String(data.pathLabel).trim(),
      pathValue,
      displayOrder: data.displayOrder ?? 0,
    });
    const list = await this.repo.listOutputPaths();
    return list.find((p) => p.PathID === id) || { PathID: id, PathLabel: String(data.pathLabel).trim(), PathValue: pathValue, IsActive: 0 };
  }

  async updateOutputPath(pathId, data) {
    const list = await this.repo.listOutputPaths();
    const existing = list.find((p) => p.PathID === parseInt(pathId, 10));
    if (!existing) throw Object.assign(new Error('Output path not found'), { statusCode: 404 });
    let pathValue = data.pathValue;
    if (pathValue !== undefined && pathValue !== null) {
      pathValue = String(pathValue).trim();
      if (!pathValue) {
        throw Object.assign(new Error('pathValue cannot be empty'), { statusCode: 400 });
      }
      const { ensureScanOutputDirectory } = await import('../scan/scanOutputPaths.js');
      ensureScanOutputDirectory(pathValue);
    }
    await this.repo.updateOutputPath(pathId, {
      pathLabel: data.pathLabel !== undefined ? String(data.pathLabel).trim() : undefined,
      pathValue,
      displayOrder: data.displayOrder,
    });
    return this.listOutputPaths();
  }

  async setActiveOutputPath(pathId) {
    const list = await this.repo.listOutputPaths();
    const found = list.find((p) => p.PathID === parseInt(pathId, 10));
    if (!found) throw Object.assign(new Error('Output path not found'), { statusCode: 404 });
    await this.repo.setActiveOutputPath(pathId);
    return this.listOutputPaths();
  }

  async deleteOutputPath(pathId) {
    const list = await this.repo.listOutputPaths();
    const found = list.find((p) => p.PathID === parseInt(pathId, 10));
    if (!found) throw Object.assign(new Error('Output path not found'), { statusCode: 404 });
    if (found.IsActive === 1) {
      throw Object.assign(new Error('Cannot delete the active path. Set another path as active first.'), { statusCode: 400 });
    }
    await this.repo.deleteOutputPath(pathId);
  }
}
