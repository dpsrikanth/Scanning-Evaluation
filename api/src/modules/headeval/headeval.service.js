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

  async assignBooklets({ bookletIds, toUserId, allocationType }, assignedBy) {
    if (!bookletIds?.length) {
      throw Object.assign(new Error('At least one bookletId is required'), { statusCode: 400 });
    }
    if (!toUserId) {
      throw Object.assign(new Error('toUserId is required'), { statusCode: 400 });
    }
    return this.repo.assignBooklets({ bookletIds, toUserId, allocationType, assignedBy });
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
