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
    return this.repo.autoAssignForPaper({ paperId, limit, assignedBy });
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
    return this.repo.assignBooklets({ bookletIds, toUserId, allocationType: 'Primary', assignedBy });
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
}
