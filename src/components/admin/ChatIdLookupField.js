import React from 'react';
import { GcdsButton } from '@gcds-core/components-react';
import FeedbackInlineError from '../chat/FeedbackInlineError.js';

// Shared label + input + submit button for a "do something with this chat
// ID" form — the part that's identical across ViewChatByIdSection.js/
// DeleteChatSection.js/DeleteExpertEval.js. What differs between them
// (the expand/collapse wrapper, the submit handler, the button's role/
// text, whether a result gets shown afterward) stays owned by each caller,
// not bundled in here — purely presentational, no state of its own.
//
// className="filter-input" (not "form-control", which isn't real GC DS
// styling in this project — see admin.css's own comment on .filter-input
// mirroring GcdsInput's shadow-DOM border/focus tokens).
const ChatIdLookupField = ({
  fieldId,
  label,
  placeholder,
  value,
  onChange,
  disabled,
  hasError,
  errorMessage,
  errorCount,
  errorRef,
  buttonRole,
  buttonLabel,
}) => {
  const errorId = `${fieldId}-error`;
  return (
    <>
      <label htmlFor={fieldId} className="filter-label display-block">
        {label}
      </label>
      {hasError && (
        <FeedbackInlineError
          id={errorId}
          message={errorMessage}
          errorCount={errorCount}
          inputRef={errorRef}
        />
      )}
      <div className="chat-id-lookup-field">
        <input
          type="text"
          id={fieldId}
          className="filter-input"
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          disabled={disabled}
          aria-describedby={hasError ? errorId : undefined}
        />
      </div>
      <GcdsButton type="submit" buttonRole={buttonRole} disabled={disabled} className="mt-200 mb-300">
        {buttonLabel}
      </GcdsButton>
    </>
  );
};

export default ChatIdLookupField;
