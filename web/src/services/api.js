const API_BASE = import.meta.env.VITE_API_BASE || '/api';

function getToken() { return localStorage.getItem('token'); }
function getSessionId() { return localStorage.getItem('sessionId'); }

function getHeaders(isFormData = false) {
  const token = getToken();
  const headers = {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  if (!isFormData) headers['Content-Type'] = 'application/json';
  return headers;
}

async function request(url, options = {}) {
  const isFormData = options.body instanceof FormData;
  const res = await fetch(`${API_BASE}${url}`, {
    headers: getHeaders(isFormData),
    ...options,
  });

  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(text ? `Invalid JSON from server (${res.status})` : `Empty response (${res.status})`);
  }

  if (data == null || typeof data !== 'object') {
    throw new Error(`Invalid API response (${res.status})`);
  }

  /* POST /auth/login returns 401 for wrong password — must not run session-expiry redirect (that hid real errors). */
  if (res.status === 401) {
    const method = (options.method || 'GET').toUpperCase();
    const isLoginFailure = method === 'POST' && url === '/auth/login' && data.success === false;
    if (isLoginFailure) {
      throw new Error(data.message || 'Invalid credentials');
    }
    if (getToken()) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      localStorage.removeItem('sessionId');
      window.location.href = '/login';
      throw new Error('Session expired');
    }
    if (data.success === false) {
      throw new Error(data.message || 'Unauthorized');
    }
    throw new Error('Unauthorized');
  }

  if (data.success === false) {
    throw new Error(data.message || 'Request failed');
  }

  if (Object.prototype.hasOwnProperty.call(data, 'data')) {
    return data.data;
  }

  return data;
}

export const api = {
  auth: {
    login: (username, password, source = 'eval') =>
      request('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password, source }),
      }),
    profile: () => request('/auth/profile'),
    changePassword: (currentPassword, newPassword) =>
      request('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      }),
    forgotPassword: (email) =>
      request('/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email }),
      }),
    verifyOtp: (userId, otpCode) =>
      request('/auth/verify-otp', {
        method: 'POST',
        body: JSON.stringify({ userId, otpCode }),
      }),
    resetPassword: (resetToken, newPassword) =>
      request('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ resetToken, newPassword }),
      }),
    loginPhoto: (formData) =>
      request('/auth/login-photo', {
        method: 'POST',
        body: formData,
      }),
    /** Compare live JPEG/PNG (base64 or data URL) to the user’s registered profile photo via face-matching-api. */
    verifyLoginFace: (body) =>
      request('/auth/verify-login-face', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    sessionContext: (data) =>
      request('/auth/session-context', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    heartbeat: (sessionId) =>
      request('/auth/heartbeat', {
        method: 'POST',
        body: JSON.stringify({ sessionId }),
      }),
    logout: () =>
      request('/auth/logout', { method: 'POST' }),
    activeSession: () => request('/auth/active-session'),
    workstations: (locationId) =>
      request(`/auth/workstations?locationId=${locationId}`),
    assignedExamPaper: () => request('/auth/assigned-exam-paper'),
    activityLogs: (params = {}) => {
      const q = new URLSearchParams(params).toString();
      return request(`/auth/activity-logs?${q}`);
    },
    /** Fire-and-forget client audit; does not redirect on 401. */
    postClientActivity: (body) =>
      fetch(`${API_BASE}/auth/client-activity`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(body),
        keepalive: true,
      }).catch(() => {}),
  },

  eval: {
    dashboardSummary: () => request('/eval/dashboard/summary'),
    pendingBooklets: (limit = 50, offset = 0) =>
      request(`/eval/booklets/pending?limit=${limit}&offset=${offset}`),
    openBooklet: (bookletId) => request(`/eval/booklet/${bookletId}`),
    startEvaluation: (bookletId, type = 'Primary') =>
      request('/eval/evaluation', {
        method: 'POST',
        body: JSON.stringify({ bookletId, type }),
      }),
    saveMarks: (evaluationId, details) =>
      request(`/eval/evaluation/${evaluationId}/marks`, {
        method: 'PUT',
        body: JSON.stringify({ details }),
      }),
    submitEvaluation: (evaluationId, totalMarks, totalPages, paperId) =>
      request(`/eval/evaluation/${evaluationId}/submit`, {
        method: 'POST',
        body: JSON.stringify({ totalMarks, totalPages, paperId }),
      }),
    logPageVisit: (evaluationId, pageNumber, durationSeconds, zoomLevel, annotationsMade, tabSwitchCount) =>
      request(`/eval/evaluation/${evaluationId}/page-visit`, {
        method: 'POST',
        body: JSON.stringify({ pageNumber, durationSeconds, zoomLevel, annotationsMade, tabSwitchCount }),
      }),
    saveAnnotations: (evaluationId, pageNumber, annotations) =>
      request(`/eval/evaluation/${evaluationId}/annotations`, {
        method: 'PUT',
        body: JSON.stringify({ pageNumber, annotations }),
      }),
    getAnnotations: (evaluationId) =>
      request(`/eval/evaluation/${evaluationId}/annotations`),
    /** Booklet-level stamps (BLANK sheet, student crossed whole page) — shared for all evaluator roles */
    getBookletSharedAnnotations: (bookletId) =>
      request(`/eval/booklet/${encodeURIComponent(bookletId)}/shared-annotations`),
    saveBookletSharedAnnotations: (bookletId, pageNumber, items) =>
      request(`/eval/booklet/${encodeURIComponent(bookletId)}/shared-annotations`, {
        method: 'PUT',
        body: JSON.stringify({ pageNumber, items }),
      }),
    saveCapturedPhoto: (formData) =>
      request('/eval/captured-photo', {
        method: 'POST',
        body: formData,
      }),
    timeReport: (params = {}) => {
      const q = new URLSearchParams(params).toString();
      return request(`/eval/time-report?${q}`);
    },
    monitoringSettings: () => request('/eval/monitoring-settings'),
  },

  files: {
    pageUrl: (bookletId, pageNumber) => {
      const token = getToken();
      return `${API_BASE}/files/page/${bookletId}/${pageNumber}?token=${encodeURIComponent(token || '')}`;
    },
    bookletAvailability: (bookletId) =>
      request(`/files/booklet/${encodeURIComponent(bookletId)}/availability`),
    bookletPdfUrl: (bookletId) => {
      const token = getToken();
      return `${API_BASE}/files/booklet/${encodeURIComponent(bookletId)}/pdf?token=${encodeURIComponent(token || '')}`;
    },
    qpaperUrl: (filePath) => {
      if (!filePath) return null;
      const filename = filePath.split(/[/\\]/).pop() || filePath;
      const token = getToken();
      return `${API_BASE}/files/qpaper/${encodeURIComponent(filename)}?token=${encodeURIComponent(token || '')}`;
    },
    /** For <img src>; query token must be encoded (JWT may contain +, /, =). */
    profilePhotoUrl: (filePath) => {
      if (!filePath) return null;
      const filename = filePath.split(/[/\\]/).pop() || filePath;
      const token = getToken();
      return `${API_BASE}/admin/photo-file/${encodeURIComponent(filename)}?token=${encodeURIComponent(token || '')}`;
    },
    /** Same resource as profilePhotoUrl but without ?token= — use with Authorization: Bearer (avoids CORS/taint on cross-origin <img> for face-api). */
    profilePhotoFileUrl: (filePath) => {
      if (!filePath) return null;
      const filename = filePath.split(/[/\\]/).pop() || filePath;
      return `${API_BASE}/admin/photo-file/${encodeURIComponent(filename)}`;
    },
  },

  admin: {
    getUsers: (params = {}) => {
      const q = new URLSearchParams(params).toString();
      return request(`/admin/users?${q}`);
    },
    getUser: (userId) => request(`/admin/users/${userId}`),
    createUser: (formData) =>
      request('/admin/users', { method: 'POST', body: formData }),
    updateUser: (userId, data) =>
      request(`/admin/users/${userId}`, { method: 'PUT', body: JSON.stringify(data) }),
    deleteUser: (userId) =>
      request(`/admin/users/${userId}`, { method: 'DELETE' }),
    resetPassword: (userId) =>
      request(`/admin/users/${userId}/reset-password`, { method: 'POST' }),
    uploadPhoto: (userId, formData) =>
      request(`/admin/users/${userId}/photo`, { method: 'POST', body: formData }),
    getUserPhoto: (userId) => request(`/admin/users/${userId}/photo`),
    getRoles: () => request('/admin/roles'),
    getLocations: () => request('/admin/locations'),
    getSettings: () => request('/admin/settings'),
    updateSettings: (settings) =>
      request('/admin/settings', { method: 'PUT', body: JSON.stringify(settings) }),
    testSmtp: (config) =>
      request('/admin/settings/test-smtp', { method: 'POST', body: JSON.stringify(config) }),
    getTemplates: () => request('/admin/email-templates'),
    getTemplate: (type) => request(`/admin/email-templates/${type}`),
    updateTemplate: (type, data) =>
      request(`/admin/email-templates/${type}`, { method: 'PUT', body: JSON.stringify(data) }),
  },

  scan: {
    settings: () => request('/scan/settings'),
  },

  scanQc: {
    rejectedBooklets: () => request('/scan/rejected-booklets'),
    vendorLots: (params = {}) => {
      const q = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => {
        if (v != null && v !== '') q.set(k, v);
      });
      const s = q.toString();
      return request(`/scan/qc/vendor/lots${s ? `?${s}` : ''}`);
    },
    vendorLotBooklets: (params = {}) => {
      const q = new URLSearchParams(params);
      return request(`/scan/qc/vendor/lot-booklets?${q}`);
    },
    vendorDecision: (bookletId, body) =>
      request(`/scan/qc/vendor/booklets/${encodeURIComponent(bookletId)}/decision`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    approveVendorLot: (body) =>
      request('/scan/qc/vendor/lots/approve', { method: 'POST', body: JSON.stringify(body) }),
    customerLots: (params = {}) => {
      const q = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => {
        if (v != null && v !== '') q.set(k, v);
      });
      const s = q.toString();
      return request(`/scan/qc/customer/lots${s ? `?${s}` : ''}`);
    },
    customerLotBooklets: (params = {}) => {
      const q = new URLSearchParams(params);
      return request(`/scan/qc/customer/lot-booklets?${q}`);
    },
    customerDecision: (bookletId, body) =>
      request(`/scan/qc/customer/booklets/${encodeURIComponent(bookletId)}/decision`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    approveCustomerLot: (body) =>
      request('/scan/qc/customer/lots/approve', { method: 'POST', body: JSON.stringify(body) }),
  },

  scanadmin: {
    // Exams
    listExams: () => request('/scanadmin/exams'),
    getExam: (examId) => request(`/scanadmin/exams/${examId}`),
    createExam: (data) => request('/scanadmin/exams', { method: 'POST', body: JSON.stringify(data) }),
    updateExam: (examId, data) => request(`/scanadmin/exams/${examId}`, { method: 'PUT', body: JSON.stringify(data) }),
    deleteExam: (examId) => request(`/scanadmin/exams/${examId}`, { method: 'DELETE' }),

    // Papers
    listPapers: (examId) => {
      const q = examId ? `?examId=${examId}` : '';
      return request(`/scanadmin/papers${q}`);
    },
    getPaper: (paperId) => request(`/scanadmin/papers/${paperId}`),
    createPaper: (data) => request('/scanadmin/papers', { method: 'POST', body: JSON.stringify(data) }),
    updatePaper: (paperId, data) => request(`/scanadmin/papers/${paperId}`, { method: 'PUT', body: JSON.stringify(data) }),
    deletePaper: (paperId) => request(`/scanadmin/papers/${paperId}`, { method: 'DELETE' }),

    // Workstations
    listWorkstations: (locationId) => {
      const q = locationId ? `?locationId=${locationId}` : '';
      return request(`/scanadmin/workstations${q}`);
    },
    getWorkstation: (id) => request(`/scanadmin/workstations/${id}`),
    createWorkstation: (data) => request('/scanadmin/workstations', { method: 'POST', body: JSON.stringify(data) }),
    updateWorkstation: (id, data) => request(`/scanadmin/workstations/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    deleteWorkstation: (id) => request(`/scanadmin/workstations/${id}`, { method: 'DELETE' }),

    // Scan Templates
    listTemplates: () => request('/scanadmin/templates'),
    getTemplate: (id) => request(`/scanadmin/templates/${id}`),
    createTemplate: (data) => request('/scanadmin/templates', { method: 'POST', body: JSON.stringify(data) }),
    updateTemplate: (id, data) => request(`/scanadmin/templates/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    deleteTemplate: (id) => request(`/scanadmin/templates/${id}`, { method: 'DELETE' }),
    uploadTemplateSampleImage: (id, formData) =>
      request(`/scanadmin/templates/${id}/sample-image`, { method: 'POST', body: formData }),
    getTemplateSampleImageUrl: (id) => `${API_BASE}/scanadmin/templates/${id}/sample-image`,

    // Printer Profiles
    listPrinterProfiles: () => request('/scanadmin/printer-profiles'),
    getPrinterProfile: (id) => request(`/scanadmin/printer-profiles/${id}`),
    createPrinterProfile: (data) => request('/scanadmin/printer-profiles', { method: 'POST', body: JSON.stringify(data) }),
    updatePrinterProfile: (id, data) => request(`/scanadmin/printer-profiles/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    deletePrinterProfile: (id) => request(`/scanadmin/printer-profiles/${id}`, { method: 'DELETE' }),

    // Helpers
    listLocations: () => request('/scanadmin/locations'),
    listScanUsers: () => request('/scanadmin/scan-users'),
    listScanRolesForUserManagement: () => request('/scanadmin/scan-roles'),
    createScanUser: (data) =>
      request('/scanadmin/scan-users', { method: 'POST', body: JSON.stringify(data) }),
    updateScanUser: (userId, data) =>
      request(`/scanadmin/scan-users/${userId}`, { method: 'PUT', body: JSON.stringify(data) }),
    deleteScanUser: (userId) =>
      request(`/scanadmin/scan-users/${userId}`, { method: 'DELETE' }),
    listScannedBooklets: (params = {}) => {
      const q = new URLSearchParams();
      if (params.examId != null) q.set('examId', params.examId);
      if (params.paperId != null) q.set('paperId', params.paperId);
      if (params.locationId != null) q.set('locationId', params.locationId);
      if (params.dateFrom) q.set('dateFrom', params.dateFrom);
      if (params.dateTo) q.set('dateTo', params.dateTo);
      if (params.limit != null) q.set('limit', params.limit);
      if (params.offset != null) q.set('offset', params.offset);
      return request(`/scanadmin/scanned-booklets${q.toString() ? `?${q}` : ''}`);
    },
    syncScanToEval: () => request('/scanadmin/sync-scan-to-eval', { method: 'POST' }),

    // Scan output paths (where booklet PDFs are stored)
    listOutputPaths: () => request('/scanadmin/output-paths'),
    createOutputPath: (data) => request('/scanadmin/output-paths', { method: 'POST', body: JSON.stringify(data) }),
    updateOutputPath: (pathId, data) => request(`/scanadmin/output-paths/${pathId}`, { method: 'PUT', body: JSON.stringify(data) }),
    setActiveOutputPath: (pathId) => request(`/scanadmin/output-paths/${pathId}/set-active`, { method: 'POST' }),
    deleteOutputPath: (pathId) => request(`/scanadmin/output-paths/${pathId}`, { method: 'DELETE' }),

    updateScanQcSettings: (data) =>
      request('/scanadmin/qc-settings', { method: 'PATCH', body: JSON.stringify(data) }),

    getMirrorConfig: () => request('/scanadmin/mirror-config'),
    updateMirrorConfig: (data) =>
      request('/scanadmin/mirror-config', { method: 'PUT', body: JSON.stringify(data) }),
    testMirrorConfig: (data) =>
      request('/scanadmin/mirror-config/test', { method: 'POST', body: JSON.stringify(data) }),
  },

  qpaper: {
    exams: () => request('/admin/qpaper/exams'),
    papers: (examId) => request(`/admin/qpaper/exams/${examId}/papers`),
    config: (paperId) => request(`/admin/qpaper/${paperId}`),
    upload: (paperId, formData) =>
      request(`/admin/qpaper/${paperId}/upload`, { method: 'POST', body: formData }),
    saveSets: (paperId, data) =>
      request(`/admin/qpaper/${paperId}/sets`, { method: 'PUT', body: JSON.stringify(data) }),
    extract: (paperId) =>
      request(`/admin/qpaper/${paperId}/extract`, { method: 'POST' }),
    fileUrl: (filePath) => {
      const token = getToken();
      return filePath ? `${API_BASE}/admin/qpaper-file/${encodeURIComponent(filePath.split('/').pop())}?token=${token}` : null;
    },
  },

  answersheet: {
    list: () => request('/admin/answer-sheets'),
    get: (id) => request(`/admin/answer-sheets/${id}`),
    create: (data) => request('/admin/answer-sheets', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) => request(`/admin/answer-sheets/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    remove: (id) => request(`/admin/answer-sheets/${id}`, { method: 'DELETE' }),
    listExams: () => request('/admin/answer-sheets/exams'),
    downloadUrl: (id) => {
      const token = getToken();
      return `${API_BASE}/admin/answer-sheets/${id}/generate?token=${token}`;
    },
  },

  headeval: {
    getLot: (params = {}) => {
      const q = new URLSearchParams(params).toString();
      return request(`/headeval/lot?${q}`);
    },
    getEvaluators: (params = {}) => {
      const q = new URLSearchParams(params).toString();
      return request(`/headeval/evaluators?${q}`);
    },
    getEvaluatorPapers: (userId) => request(`/headeval/evaluators/${userId}/papers`),
    setEvaluatorPapers: (userId, paperIds) =>
      request(`/headeval/evaluators/${userId}/papers`, {
        method: 'PUT',
        body: JSON.stringify({ paperIds }),
      }),
    getPaperEvaluatorMapping: (params = {}) => {
      const q = new URLSearchParams(params).toString();
      return request(`/headeval/paper-evaluator-mapping?${q}`);
    },
    getEvaluatorAssignments: (params = {}) => {
      const q = new URLSearchParams(params).toString();
      return request(`/headeval/evaluator-assignments?${q}`);
    },
    assign: (bookletIds, toUserId, allocationType = 'Primary') =>
      request('/headeval/assign', {
        method: 'POST',
        body: JSON.stringify({ bookletIds, toUserId, allocationType }),
      }),
    unassign: (allocationId) =>
      request(`/headeval/assign/${allocationId}`, { method: 'DELETE' }),
    getSummary: (paperId) => request(`/headeval/summary/${paperId}`),
    getExams: () => request('/headeval/exams'),
    getPapers: (examId) => request(`/headeval/exams/${examId}/papers`),
    getAllocationSettings: () => request('/headeval/allocation-settings'),
    setAllocationSettings: (allocationMode) =>
      request('/headeval/allocation-settings', {
        method: 'PUT',
        body: JSON.stringify({ allocationMode }),
      }),
    autoAssign: (paperId, limit = 200) =>
      request('/headeval/auto-assign', {
        method: 'POST',
        body: JSON.stringify({ paperId, limit }),
      }),
  },
};
