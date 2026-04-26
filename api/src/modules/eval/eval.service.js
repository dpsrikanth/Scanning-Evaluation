export default class EvalService {
  constructor(evalRepository) {
    this.repo = evalRepository;
  }

  async getDashboardSummary(evaluatorId) {
    return this.repo.getDashboardSummary(evaluatorId);
  }

  async getPendingBooklets(evaluatorId, limit, offset) {
    return this.repo.getPendingBooklets(evaluatorId, limit, offset);
  }

  static mustHaveAllocationRole(roleName) {
    return roleName === 'Evaluator' || roleName === 'Moderator';
  }

  async openBooklet(bookletId, user) {
    const data = await this.repo.getBookletForEvaluation(bookletId);
    if (!data.booklet) {
      throw Object.assign(
        new Error(
          'This booklet is not in the evaluation database yet. It may exist only in scanning. ' +
            'Ask an administrator to sync scanned booklets to evaluation (Scanner Admin → Scanned booklets → ' +
            '“Sync to evaluation”, or use Head Evaluator → sync). Then open the booklet again.'
        ),
        { statusCode: 404 }
      );
    }

    const role = user?.roleName;
    if (user && EvalService.mustHaveAllocationRole(role)) {
      const alloc = await this.repo.getActiveAllocationForEvaluator(bookletId, user.userId);
      if (!alloc) {
        throw Object.assign(
          new Error('This booklet is not assigned to you or is not available to open.'),
          { statusCode: 403 }
        );
      }
    }

    let totalPages = parseInt(data.booklet.TotalPages, 10);
    if (!Number.isFinite(totalPages) || totalPages < 1) totalPages = 0;

    const scheme = data.questionScheme || [];
    const pageNums = scheme
      .map((q) => parseInt(q.PageNumber, 10))
      .filter((n) => Number.isFinite(n) && n > 0);
    const maxFromScheme = pageNums.length > 0 ? Math.max(...pageNums) : 0;

    if (totalPages < maxFromScheme) {
      totalPages = maxFromScheme;
    }
    if (totalPages < 1) {
      totalPages = 1;
    }

    data.booklet = { ...data.booklet, TotalPages: totalPages };
    return data;
  }

  async startEvaluation(bookletId, evaluatorId, type = 'Primary', createdBy, user) {
    const evalType = type != null && type !== '' ? String(type) : 'Primary';
    const needAllocation = Boolean(
      user && EvalService.mustHaveAllocationRole(user.roleName)
    );

    if (needAllocation) {
      const alloc = await this.repo.getActiveAllocationForEvaluator(bookletId, evaluatorId);
      if (!alloc) {
        throw Object.assign(
          new Error('No active allocation for this booklet. Open it from your assigned list.'),
          { statusCode: 403 }
        );
      }
    }

    if (needAllocation) {
      const done = await this.repo.hasSubmittedEvaluation(bookletId, evaluatorId, evalType);
      if (done) {
        throw Object.assign(
          new Error('This evaluation was already submitted.'),
          { statusCode: 409 }
        );
      }
    }

    const existingId = await this.repo.findInProgressEvaluation(bookletId, evaluatorId, evalType);
    if (existingId != null) {
      if (needAllocation) {
        const alloc = await this.repo.getActiveAllocationForEvaluator(bookletId, evaluatorId);
        if (alloc && alloc.EvaluationStatus === 'Allocated') {
          await this.repo.setAllocationStatus(alloc.AllocationID, 'InProgress');
        }
      }
      return { evaluationId: existingId };
    }

    const evaluationId = await this.repo.createEvaluation({
      bookletId,
      evaluatorId,
      type: evalType,
      createdBy,
    });

    if (needAllocation) {
      const alloc = await this.repo.getActiveAllocationForEvaluator(bookletId, evaluatorId);
      if (alloc && alloc.EvaluationStatus === 'Allocated') {
        await this.repo.setAllocationStatus(alloc.AllocationID, 'InProgress');
      }
    }

    return { evaluationId };
  }

  async getMarks(evaluationId) {
    const details = await this.repo.getEvaluationDetails(evaluationId);
    return { evaluationId, marks: details };
  }

  async saveMarks(evaluationId, details) {
    await this.repo.deleteEvaluationDetails(evaluationId);
    for (const detail of details) {
      detail.evaluationId = evaluationId;
      await this.repo.saveEvaluationDetail(detail);
    }
    return { evaluationId, savedCount: details.length };
  }

  // Compute total marks applying best-N rule for Common sets
  async computeTotalMarks(evaluationId, paperId) {
    const [details, sets] = await Promise.all([
      this.repo.getEvaluationDetails(evaluationId),
      paperId ? this.repo.getQuestionSetsForPaper(paperId) : Promise.resolve([]),
    ]);

    if (!sets || sets.length === 0) {
      return details.reduce((s, d) => s + parseFloat(d.MarksAwarded || 0), 0);
    }

    let total = 0;
    for (const set of sets) {
      const setDetails = details.filter(d => d.SetID === set.SetID);
      const markValues = setDetails.map(d => parseFloat(d.MarksAwarded || 0));
      if (set.SetType === 'Common') {
        const sorted = [...markValues].sort((a, b) => b - a).slice(0, set.AttemptQuestions);
        total += sorted.reduce((s, v) => s + v, 0);
      } else {
        total += markValues.reduce((s, v) => s + v, 0);
      }
    }

    // Add marks for questions not linked to any set (legacy scheme entries)
    const setIds = new Set(sets.map(s => s.SetID));
    const unsetDetails = details.filter(d => !d.SetID || !setIds.has(d.SetID));
    total += unsetDetails.reduce((s, d) => s + parseFloat(d.MarksAwarded || 0), 0);

    return Math.round(total * 100) / 100;
  }

  async submitEvaluation(evaluationId, clientTotalMarks, totalPages, paperId) {
    const visitedPages = await this.repo.getVisitedPages(evaluationId);
    const parsedReq = parseInt(String(totalPages ?? 0), 10);
    const required = Number.isFinite(parsedReq) && parsedReq > 0 ? parsedReq : 0;
    const uniqueVisited = new Set(
      visitedPages
        .map((p) => parseInt(String(p), 10))
        .filter((n) => Number.isFinite(n) && n > 0)
    );
    const allVisited = !required || uniqueVisited.size >= required;

    if (!allVisited) {
      throw Object.assign(
        new Error(
          `Not all pages visited (${uniqueVisited.size}/${required}). Visit every page before submitting.`
        ),
        { statusCode: 400 }
      );
    }

    // Recompute total server-side (best-N rule applied)
    const totalMarks = await this.computeTotalMarks(evaluationId, paperId);

    await this.repo.updateAllPagesVisited(evaluationId, true);
    await this.repo.submitEvaluation(evaluationId, totalMarks);
    await this.repo.completeAllocationForEvaluation(evaluationId);
    return { evaluationId, totalMarks, submitted: true };
  }

  async logPageVisit(evaluationId, pageNumber, durationSeconds, zoomLevel, annotationsMade) {
    await this.repo.logPageVisit(evaluationId, pageNumber, durationSeconds, zoomLevel, annotationsMade);
  }

  async saveAnnotations(evaluationId, pageNumber, annotations) {
    await this.repo.saveAnnotations(evaluationId, pageNumber, annotations);
    return { evaluationId, pageNumber, savedCount: annotations.length };
  }

  async getAnnotations(evaluationId) {
    return this.repo.getAnnotations(evaluationId);
  }

  async assertBookletExists(bookletId) {
    const ok = await this.repo.bookletExists(bookletId);
    if (!ok) {
      throw Object.assign(new Error('Booklet not found in evaluation database'), { statusCode: 404 });
    }
  }

  /** Shared across Primary / Secondary / Moderator / all eval viewers — JSON items per page */
  async getBookletSharedAnnotations(bookletId) {
    await this.assertBookletExists(bookletId);
    return this.repo.getBookletSharedAnnotations(bookletId);
  }

  async saveBookletSharedAnnotationsPage(bookletId, pageNumber, items, userId) {
    await this.assertBookletExists(bookletId);
    const pn = parseInt(String(pageNumber ?? ''), 10);
    if (!Number.isFinite(pn) || pn < 1) {
      throw Object.assign(new Error('Invalid pageNumber'), { statusCode: 400 });
    }
    const list = Array.isArray(items) ? items : [];
    await this.repo.saveBookletSharedAnnotationsPage(bookletId, pn, list, userId);
    return { bookletId, pageNumber: pn, savedCount: list.length };
  }

  async saveCapturedPhoto({ userId, evaluationId, photoPath, faceMatchScore, faceMatchResult, captureType, ipAddress }) {
    const photoId = await this.repo.saveCapturedPhoto({
      userId, evaluationId, photoPath, faceMatchScore, faceMatchResult, captureType, ipAddress,
    });
    await this.repo.insertActivityLog({
      userId, moduleName: 'eval',
      actionType: captureType === 'SessionStart' ? 'FACE_VERIFY' : 'PHOTO_CAPTURE',
      referenceId: photoId,
      newValues: { faceMatchResult, faceMatchScore },
      ipAddress,
    });
    return { photoId, faceMatchResult };
  }

  async getTimeReport(query, requestingUser) {
    const { roleName, userId } = requestingUser;
    const isRestricted = roleName !== 'Admin' && roleName !== 'HeadEvaluator';
    const filters = { ...query, evaluatorId: isRestricted ? userId : query.evaluatorId };
    const [evaluatorRows, subjectRows] = await Promise.all([
      this.repo.getTimeReport(filters),
      this.repo.getSubjectTimeReport(filters),
    ]);
    const settings = await this.repo.getMonitoringSettings();
    const threshold = parseInt(settings.min_time_default || '300', 10);
    const addFlag = row => ({ ...row, isFlagged: (row.avgSecondsPerSheet ?? 999) < threshold });
    return {
      evaluators: evaluatorRows.map(addFlag),
      subjects: subjectRows,
      threshold,
    };
  }

  async getMonitoringSettings() {
    return this.repo.getMonitoringSettings();
  }
}
