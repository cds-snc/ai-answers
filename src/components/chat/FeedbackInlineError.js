import React from 'react';
import { GcdsIcon } from '@gcds-core/components-react';

// key={errorCount} forces a fresh DOM node on every trigger, so useFocusOnChange's
// ref.current.focus() always targets an element that wasn't already focused —
// see useInlineFormError/useFocusOnChange for why that matters on repeat failures.
// Icon matches GC DS's own gcds-error-message component (warning-triangle, same token).
const FeedbackInlineError = ({ id, message, errorCount, inputRef }) => (
  <p
    key={errorCount}
    className="form-error-message font-size-text-sm-nr"
    id={id}
    role="alert"
    ref={inputRef}
    tabIndex={-1}
  >
    <GcdsIcon name="warning-triangle" marginRight="50" />
    {message}
  </p>
);

export default FeedbackInlineError;
