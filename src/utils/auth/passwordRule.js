// The one password rule, shared by the sign-up and reset pages (checks before
// sending) and the server (api/auth/auth-signup.js, auth-reset-password.js),
// so a direct API call can't set a password the pages would refuse.
//
// NIST SP 800-63B: a minimum length and no composition rules. No maximum:
// bcrypt only uses the first 72 bytes, so a longer passphrase still works.
//
// Changing the length? Also update the copy that states it, in en.json and
// fr.json: auth.passwordHint, signup.passwordTooShort and
// reset.complete.passwordTooShort.
export const PASSWORD_MIN_LENGTH = 8;

// Counts characters, not UTF-16 units, so "é" or an emoji counts as one.
export const meetsPasswordRule = (value) =>
  typeof value === 'string' && [...value].length >= PASSWORD_MIN_LENGTH;
