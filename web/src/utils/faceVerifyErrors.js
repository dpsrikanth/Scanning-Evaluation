/**
 * Map API / network errors from face verification to user-facing copy.
 * Keeps technical env/config jargon out of primary messages.
 */
export function mapFaceVerifyFailure(rawMsg) {
  const m = String(rawMsg || '').toLowerCase();
  if (
    m.includes('face verification service is unavailable') ||
    m.includes('timeout') ||
    m.includes('aborted') ||
    m.includes('econnrefused') ||
    m.includes('fetch failed')
  ) {
    return {
      title: 'Verification service not ready',
      message:
        'The identity check could not run. This usually means the face-verification service is still starting, not running, or unreachable from the API server.',
      hint: 'Wait a minute after starting services, then try again. If it persists, ask your administrator to start the face-matching service (port 8050) and ensure the API server can reach it.',
    };
  }
  if (m.includes('network') || m.includes('failed to fetch')) {
    return {
      title: 'Connection problem',
      message: 'Could not reach the server. Check your internet connection and try again.',
      hint: null,
    };
  }
  return {
    title: 'Verification failed',
    message: rawMsg || 'Something went wrong during verification. Try again or contact support.',
    hint: null,
  };
}
