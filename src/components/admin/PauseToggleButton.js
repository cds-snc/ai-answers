import React from 'react';

// TODO(design): needs design review. This is a native <button> (not
// <GcdsButton>) styled via .filter-button/.filter-button-outline in
// admin.css to reproduce GcdsButton's button--role-secondary + small look —
// GcdsButton copies aria-* attributes onto its shadow-DOM button inside its
// own click handler, before React's state update from that same click
// commits, so aria-pressed was always one click behind for screen readers.
// A designer hasn't signed off on this specific treatment; revisit once
// reviewed. Pair with usePauseToggle for the state/ref this button controls.
export default function PauseToggleButton({ isPaused, onToggle, t, className = '' }) {
  return (
    <button
      type="button"
      className={`filter-button filter-button-outline${className ? ` ${className}` : ''}`}
      onClick={onToggle}
      aria-pressed={isPaused}
    >
      {isPaused ? t('common.resumeUpdates') : t('common.pauseUpdates')}
    </button>
  );
}
