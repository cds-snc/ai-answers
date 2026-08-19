import React from 'react';
import { GcdsIcon } from '@gcds-core/components-react';

// TODO (follow-up): this component has outgrown its name/location. It
// started as chat-feedback-form-specific (PublicFeedbackComponent.js/
// ExpertFeedbackComponent.js) but is now the general-purpose field-level
// inline validation error, also used by admin pages with nothing to do with
// "feedback" (DatabasePage.js, SettingsPage.js, VectorPage.js,
// SimilarChatsDashboard.js). Per AGENTS.md's folder convention ("If a hook/
// component/helper becomes cross-feature, promote it to a shared location
// and update imports"), rename/move this (e.g. src/components/common/
// InlineFieldError.js) and update all importers + the AGENTS.md/
// accessibility-review skill references to it.
//
// key={errorCount} forces a fresh DOM node on every trigger, so useFocusOnChange's
// ref.current.focus() always targets an element that wasn't already focused —
// see useInlineFormError/useFocusOnChange for why that matters on repeat failures.
// Icon matches GC DS's own gcds-error-message component (warning-triangle, same token).
// announce=false skips role="alert" — for when several of these can mount in
// the same commit (e.g. one per missing field, alongside a summary that's
// already announcing). The message is still visible and still reachable via
// aria-describedby on its field, just not competing as its own live region.
const FeedbackInlineError = ({ id, message, errorCount, inputRef, announce = true }) => (
  <p
    key={errorCount}
    className="form-error-message font-size-text-sm-nr"
    id={id}
    role={announce ? 'alert' : undefined}
    ref={inputRef}
    tabIndex={-1}
  >
    <GcdsIcon name="warning-triangle" marginRight="50" />
    {message}
  </p>
);

export default FeedbackInlineError;
