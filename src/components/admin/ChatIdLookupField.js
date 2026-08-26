import React from 'react';
import { GcdsButton } from '@gcds-core/components-react';
import FeedbackInlineError from '../chat/FeedbackInlineError.js';
import ChatIdMatchList from './ChatIdMatchList.js';

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
  // Every caller's visible label is the same text ("Chat ID") — three
  // identical accessible names for three different-purpose fields (view a
  // chat vs. delete a chat vs. delete an expert eval). A sighted user, or
  // someone reading the page linearly, gets context from the field's own
  // <summary> right above it; someone using a screen reader's "list all
  // form fields" navigation mode doesn't. `describedById` points at the
  // caller's own <summary id>, adding that context to the accessible
  // *description* (not the name, which stays plain "Chat ID" — see
  // SC 2.5.3 Label in Name).
  describedById,
  // Partial-match pick-list, from useChatIdLookup.js's searchChats/matches -
  // optional: DeleteByChatIdSection.js's exact-only lookup never passes
  // these. matchesHeading/matchesTruncatedMessage are pre-translated
  // strings (this component does no i18n of its own) so the caller
  // controls the interpolated {count}.
  matches,
  matchesHeading,
  matchesTruncatedMessage,
  onSelectMatch,
}) => {
  const errorId = `${fieldId}-error`;
  const describedBy = [describedById, hasError && errorId].filter(Boolean).join(' ') || undefined;
  return (
    // chat-id-lookup-group: lets admin.css give this field's label the same
    // real GC DS desktop font as ChatViewer.js's/SettingsPage.js's own
    // fields - this component doesn't own a page wrapper to get that from,
    // and the label isn't inside .chat-id-lookup-field below (input-only,
    // for the width cap).
    <div className="chat-id-lookup-group">
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
          aria-required="true"
          aria-describedby={describedBy}
        />
      </div>
      <GcdsButton type="submit" buttonRole={buttonRole} disabled={disabled} className="mt-200 mb-300">
        {buttonLabel}
      </GcdsButton>
      <ChatIdMatchList
        fieldId={fieldId}
        matches={matches}
        matchesHeading={matchesHeading}
        matchesTruncatedMessage={matchesTruncatedMessage}
        onSelectMatch={onSelectMatch}
      />
    </div>
  );
};

export default ChatIdLookupField;
