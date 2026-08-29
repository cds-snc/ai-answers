import { useState } from 'react';

// Centralizes the success/system-error message pair shared across the
// sign-in/account pages (RegisterPage, ResetRequestPage, ResetCompletePage)
// — success is a completed action outcome (StatusMessage variant="success"),
// systemError is an outcome the user can't fix by editing a field
// (StatusMessage variant="error"). Field-tied errors stay on the separate
// useAuthFormValidation/AnnouncedError pair; this hook only covers the two
// StatusMessage-rendered outcomes.
//
// Extracted after the three pages independently hand-rolled this same pair
// and drifted once as a result — RegisterPage's "Sign in" link ended up
// conditional on successMessage while the other two pages' didn't, purely
// because each page's version was written separately. Sharing the state
// shape doesn't prevent every kind of drift on its own, but removes one
// source of it.
export const useAuthOutcomeMessages = () => {
  const [successMessage, setSuccessMessage] = useState('');
  const [systemError, setSystemError] = useState('');

  const clearMessages = () => {
    setSuccessMessage('');
    setSystemError('');
  };

  return { successMessage, setSuccessMessage, systemError, setSystemError, clearMessages };
};
