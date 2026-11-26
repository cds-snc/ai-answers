// Minimal email shape check used by the account pages (Login, Register,
// ResetRequest) once they stopped relying on the browser's native
// type="email" constraint validation for error messaging — see
// AnnouncedError / useAnnouncedError, which those pages use to surface this
// check accessibly instead of a native validation bubble.
//
// Also used by the server (api/auth/auth-signup.js), so the pages and the API
// refuse the same addresses.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// RFC 5321 limit on a whole address
const MAX_EMAIL_LENGTH = 254;

// Strips incidental leading/trailing whitespace (e.g. pasted from a
// clipboard) before an email is validated or sent anywhere — callers should
// normalize through this rather than validating/sending the raw input value.
export const normalizeEmail = (value) => (value || '').trim();

export const isValidEmail = (value) =>
  typeof value === 'string' && value.length <= MAX_EMAIL_LENGTH && EMAIL_PATTERN.test(value);
