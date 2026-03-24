export function ok(res, data, message = 'Success') {
  return res.json({ success: true, message, data });
}

export function created(res, data, message = 'Created') {
  return res.status(201).json({ success: true, message, data });
}

export function badRequest(res, message = 'Bad request') {
  return res.status(400).json({ success: false, message });
}

export function unauthorized(res, message = 'Unauthorized') {
  return res.status(401).json({ success: false, message });
}

export function forbidden(res, message = 'Forbidden') {
  return res.status(403).json({ success: false, message });
}

export function notFound(res, message = 'Not found') {
  return res.status(404).json({ success: false, message });
}

export function conflict(res, message = 'Conflict') {
  return res.status(409).json({ success: false, message });
}

export function serverError(res, message = 'Internal server error') {
  return res.status(500).json({ success: false, message });
}
