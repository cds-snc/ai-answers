import { useState } from 'react';
import { useFocusOnChange } from './useFocusOnChange.js';

// Tracks a dismissible validation error for a required-selection form field.
// errorCount (rather than a boolean) is what makes repeat failed submits keep
// re-focusing/re-announcing the error message via useFocusOnChange — see that
// hook's comment for why a boolean can't do this.
export const useInlineFormError = () => {
  const [errorCount, setErrorCount] = useState(0);
  const errorRef = useFocusOnChange(errorCount);

  return {
    hasError: errorCount > 0,
    errorCount,
    errorRef,
    triggerError: () => setErrorCount((n) => n + 1),
    clearError: () => setErrorCount(0),
  };
};
