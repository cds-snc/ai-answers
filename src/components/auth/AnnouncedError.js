import React from 'react';
import { GcdsIcon } from '@gcds-core/components-react';

// key={errorCount} forces a fresh DOM node on every trigger, so useAnnouncedError's
// ref.current.focus() always targets an element that wasn't already focused —
// see FeedbackInlineError/useInlineFormError for why that matters on repeat failures.
// Icon matches GC DS's own gcds-error-message component (warning-triangle, same token).
const AnnouncedError = ({ id, message, errorCount, inputRef, className = 'form-error-message font-size-text-sm-nr mrgn-bttm-20' }) => (
  <div key={errorCount} id={id} className={className} role="alert" tabIndex={-1} ref={inputRef}>
    <GcdsIcon name="warning-triangle" marginRight="50" />
    {message}
  </div>
);

export default AnnouncedError;
