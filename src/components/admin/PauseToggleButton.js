import React from 'react';

// TODO(design): needs design review. This is a native <button> (not
// <GcdsButton>) styled via .filter-button/.filter-button-outline in
// admin.css to reproduce GcdsButton's button--role-secondary + small look —
// GcdsButton copies aria-* attributes onto its shadow-DOM button inside its
// own click handler, before React's state update from that same click
// commits, so aria-pressed was always one click behind for screen readers.
// A designer hasn't signed off on this specific treatment; revisit once
// reviewed. Pair with usePauseToggle for the state/ref this button controls.
//
// forwardRef: a durable, always-visible, always-mounted focus target near
// the table - e.g. BatchList.js redirects focus here after a delete, since
// the deleted row (and whatever had focus on it) is gone and there's
// nothing left for the usual row-remount focus-restoration to consume.
const PauseToggleButton = React.forwardRef(({ isPaused, onToggle, t, className = '' }, ref) => {
  return (
    <button
      ref={ref}
      type="button"
      className={`filter-button filter-button-outline${className ? ` ${className}` : ''}`}
      onClick={onToggle}
      aria-pressed={isPaused}
    >
      {isPaused ? t('common.resumeUpdates') : t('common.pauseUpdates')}
    </button>
  );
});

PauseToggleButton.displayName = 'PauseToggleButton';

export default PauseToggleButton;
