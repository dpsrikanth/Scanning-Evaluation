import { sendDirectMail } from '../../services/mailer.js';
import logger from '../../utils/logger.js';

export default class HeadEvalService {
  constructor(repo) {
    this.repo = repo;
  }

  async getLot(filters) {
    return this.repo.getLot(filters);
  }

  async getEvaluators(filters) {
    return this.repo.getEvaluators(filters);
  }

  async getAllocationSettings() {
    const allocationMode = await this.repo.getAllocationMode();
    return { allocationMode };
  }

  async setAllocationSettings({ allocationMode }) {
    const mode = await this.repo.setAllocationMode(allocationMode);
    return { allocationMode: mode };
  }

  async autoAssignForPaper({ paperId, limit }, assignedBy) {
    const result = await this.repo.autoAssignForPaper({ paperId, limit, assignedBy });
    await this._sendAutoAssignEmails(result);
    return result;
  }

  async tryAutoAssignOneBooklet(params) {
    return this.repo.tryAutoAssignOneBooklet(params);
  }

  async assignBooklets({ bookletIds, toUserId, allocationType }, assignedBy) {
    if (!bookletIds?.length) {
      throw Object.assign(new Error('At least one bookletId is required'), { statusCode: 400 });
    }
    if (!toUserId) {
      throw Object.assign(new Error('toUserId is required'), { statusCode: 400 });
    }
    const t = allocationType != null ? String(allocationType) : 'Primary';
    if (t !== 'Primary') {
      throw Object.assign(
        new Error('Only Primary allocation is supported for assignment'),
        { statusCode: 400 }
      );
    }
    const result = await this.repo.assignBooklets({ bookletIds, toUserId, allocationType: 'Primary', assignedBy });
    await this._sendManualAssignEmail({ toUserId, results: result, assignedBy });
    return result;
  }

  async unassign(allocationId, unassignedBy) {
    return this.repo.unassignBooklet(allocationId, unassignedBy);
  }

  async getAllocationSummary(paperId) {
    return this.repo.getAllocationSummary(paperId);
  }

  async getExams() {
    return this.repo.listExams();
  }

  async getPapers(examId) {
    return this.repo.listPapers(examId);
  }

  async getEvaluatorPapers(userId) {
    return this.repo.getEvaluatorPaperMappings(userId);
  }

  async setEvaluatorPapers(userId, paperIds, updatedBy) {
    return this.repo.setEvaluatorPaperMappings(userId, paperIds, updatedBy);
  }

  async getPaperEvaluatorMappings(filters) {
    return this.repo.listPaperEvaluatorMappings(filters || {});
  }

  async getEvaluatorAssignments(filters) {
    return this.repo.getEvaluatorAssignmentReport(filters || {});
  }

  async _sendManualAssignEmail({ toUserId, results, assignedBy }) {
    try {
      const user = await this.repo.getUserById(toUserId);
      if (!user?.Email) return;
      const assigned = (results || []).filter((r) => r.status === 'assigned').length;
      const already = (results || []).filter((r) => r.status === 'already_allocated').length;
      const mismatch = (results || []).filter((r) => r.status === 'paper_mismatch').length;
      const notOpen = (results || []).filter((r) => r.status === 'not_open').length;
      if (assigned <= 0) return;
      const subject = `Booklet assignment update - ${assigned} assigned`;
      const html = `
        <div style="font-family: Arial, sans-serif; font-size: 14px; color: #0f172a;">
          <p>Dear ${user.FullName || 'Evaluator'},</p>
          <p>You have received new booklet assignments.</p>
          <ul>
            <li>Assigned: <strong>${assigned}</strong></li>
            <li>Already allocated: <strong>${already}</strong></li>
            <li>Paper mismatch blocked: <strong>${mismatch}</strong></li>
            <li>Not open: <strong>${notOpen}</strong></li>
          </ul>
          <p>Assigned by: <strong>${assignedBy || 'System'}</strong></p>
        </div>
      `;
      await sendDirectMail(user.Email, subject, html);
    } catch (err) {
      logger.error('manual assignment email failed', { error: err.message });
    }
  }

  async _sendAutoAssignEmails(result) {
    try {
      const rows = result?.results || [];
      const assignedRows = rows.filter((r) => r.status === 'assigned' && r.evaluatorId);
      if (!assignedRows.length) return;
      const grouped = new Map();
      for (const row of assignedRows) {
        const key = String(row.evaluatorId);
        grouped.set(key, (grouped.get(key) || 0) + 1);
      }
      for (const [userIdStr, count] of grouped.entries()) {
        const user = await this.repo.getUserById(parseInt(userIdStr, 10));
        if (!user?.Email) continue;
        const subject = `Auto assignment update - ${count} assigned`;
        const html = `
          <div style="font-family: Arial, sans-serif; font-size: 14px; color: #0f172a;">
            <p>Dear ${user.FullName || 'Evaluator'},</p>
            <p>Auto-assignment has added <strong>${count}</strong> new booklet(s) to your queue.</p>
            <p>Please log in and start evaluation.</p>
          </div>
        `;
        await sendDirectMail(user.Email, subject, html);
      }
    } catch (err) {
      logger.error('auto assignment email failed', { error: err.message });
    }
  }
}
