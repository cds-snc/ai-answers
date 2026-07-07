import { useState } from 'react';
import { useFocusOnChange } from '../useFocusOnChange.js';

// Tracks a message-bearing form error that should be announced and focused
// every time it fires — including two consecutive failures with the identical
// message (e.g. two invalid-login attempts in a row). errorCount (rather than
// a message-changed check) is what makes that repeat case still re-focus/
// re-announce — see useFocusOnChange for why a value that doesn't change
// can't do this. Mirrors useInlineFormError's shape but carries a message
// instead of a boolean.
export const useAnnouncedError = () => {
  const [message, setMessage] = useState('');
  const [errorCount, setErrorCount] = useState(0);
  const errorRef = useFocusOnChange(errorCount);

  const setError = (msg) => {
    if (msg) {
      setMessage(msg);
      setErrorCount((n) => n + 1);
    } else {
      setMessage('');
    }
  };

  return { error: message, errorCount, errorRef, setError, clearError: () => setMessage('') };
};
