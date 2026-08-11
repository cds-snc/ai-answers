import { useState } from 'react';
import { useAnnouncedError } from './useAnnouncedError.js';
import { validateRequiredEmailFields } from '../../utils/auth/validateAuthFields.js';

// Wraps useAnnouncedError with per-field invalid tracking, so setting one
// error message doesn't mark every field on the form aria-invalid — only the
// field(s) that error actually concerns (e.g. a missing password shouldn't
// flag an already-valid email as invalid too).
//
// validate() runs the shared required/email-format check (see
// validateAuthFields.js) and announces + flags on failure. setError() covers
// page-specific errors that check isn't aware of (password mismatch, invalid
// credentials, server errors) — pass the field name(s) it concerns as the
// second argument, or omit it when no specific field is at fault.
export const useAuthFormValidation = () => {
  const { error, errorCount, errorRef, setError: setAnnouncedError, clearError: clearAnnouncedError } = useAnnouncedError();
  const [invalidFields, setInvalidFields] = useState([]);

  const setError = (message, fields = []) => {
    setInvalidFields(fields);
    setAnnouncedError(message);
  };

  const clearError = () => {
    setInvalidFields([]);
    clearAnnouncedError();
  };

  const validate = (fields, t) => {
    const result = validateRequiredEmailFields(fields);
    if (result) {
      setError(t(result.errorKey), result.invalidFields);
      return false;
    }
    return true;
  };

  const isFieldInvalid = (name) => invalidFields.includes(name);

  return { error, errorCount, errorRef, setError, clearError, validate, isFieldInvalid };
};
