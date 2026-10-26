// Minimal email shape check used by the account pages (Login, Register,
// ResetRequest) once they stopped relying on the browser's native
// type="email" constraint validation for error messaging — see
// AnnouncedError / useAnnouncedError, which those pages use to surface this
// check accessibly instead of a native validation bubble.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Strips incidental leading/trailing whitespace (e.g. pasted from a
// clipboard) before an email is validated or sent anywhere — callers should
// normalize through this rather than validating/sending the raw input value.
export const normalizeEmail = (value) => (value || '').trim();

export const isValidEmail = (value) => EMAIL_PATTERN.test(value);
