import { useEffect, useRef } from 'react';

// A GcdsButton drawn in the same commit as the close has no inner <button>
// until Stencil renders it on a later frame, so focus() on it does nothing
// yet. Retry for this many frames while focus is still lost to <body>.
const MAX_FRAMES = 10;

// Focuses `targetRef` when `isOpen` transitions from true to false (the user
// closed a disclosure/panel) — not on initial mount, when nothing was ever
// open. Mirrors useFocusOnChange but for the closing edge, so focus returns
// to the control that opened the panel instead of being lost to <body> when
// the panel unmounts.
//
// The target can be re-created by the close itself (ExpertFeedbackPanel.js's
// Edit button). That's why it retries on later frames — but only while
// focus is still on <body>, so it never takes focus back from wherever the
// user has since moved it.
export const useReturnFocusOnClose = (isOpen, targetRef) => {
  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (!isOpen && wasOpenRef.current) {
      let frameId;
      const focusTarget = (framesLeft) => {
        const target = targetRef.current;
        if (!target) return;
        target.focus();
        const lost = !document.activeElement || document.activeElement === document.body;
        if (lost && framesLeft > 0) {
          frameId = requestAnimationFrame(() => focusTarget(framesLeft - 1));
        }
      };
      focusTarget(MAX_FRAMES);
      wasOpenRef.current = isOpen;
      return () => cancelAnimationFrame(frameId);
    }
    wasOpenRef.current = isOpen;
  }, [isOpen, targetRef]);
};
