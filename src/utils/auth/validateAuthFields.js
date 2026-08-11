import { isValidEmail } from './validateEmail.js';

// Shared required-field + email-format check used by LoginPage, RegisterPage,
// and ResetRequestPage, so the rule (and any future change to it) lives in
// one place instead of being copied per page. `fields` is a flat map of
// field name -> current value (email should already be normalized via
// normalizeEmail before being passed in); every key is treated as required,
// and a key named "email" is additionally checked for shape.
//
// Returns null when the fields pass, or { errorKey, invalidFields } naming
// the translation key to show and which field(s) to mark aria-invalid.
export const validateRequiredEmailFields = (fields) => {
  const missing = Object.keys(fields).filter((name) => !fields[name]);
  if (missing.length > 0) {
    return { errorKey: 'validation.required', invalidFields: missing };
  }
  if ('email' in fields && !isValidEmail(fields.email)) {
    return { errorKey: 'validation.emailInvalid', invalidFields: ['email'] };
  }
  return null;
};
