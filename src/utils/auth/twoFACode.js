// The one rule for what counts as a sign-in code, shared by the login page
// (checks before sending) and TwoFAService (checks before counting an attempt),
// so the two can't drift apart.
//
// Returns the 6 digits with any spaces removed (a code copied as "123 456"
// still works), or null for anything else: not a string, empty, letters, or
// the wrong length.
//
// Changing the length? Also update the copy that states it, in en.json and
// fr.json: login.2fa.codeHint and login.2fa.codeFormat.
export const TWOFA_CODE_LENGTH = 6;

const CODE_PATTERN = new RegExp(`^\\d{${TWOFA_CODE_LENGTH}}$`);

export const normalizeTwoFACode = (value) => {
  if (typeof value !== 'string') return null;
  const digits = value.replace(/\s/g, '');
  return CODE_PATTERN.test(digits) ? digits : null;
};
