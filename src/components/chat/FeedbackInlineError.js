import React from 'react';

// key={errorCount} forces a fresh DOM node on every trigger, so useFocusOnChange's
// ref.current.focus() always targets an element that wasn't already focused —
// see useInlineFormError/useFocusOnChange for why that matters on repeat failures.
const FeedbackInlineError = ({ id, message, errorCount, inputRef }) => (
  <p
    key={errorCount}
    className="feedback-inline-error"
    id={id}
    role="alert"
    ref={inputRef}
    tabIndex={-1}
  >
    {message}
  </p>
);

export default FeedbackInlineError;
