import { useEffect } from 'react';

// Focuses the element with this id once `ready` turns true (e.g. data loaded
// and the target rendered). Retries per frame until focus sticks -
// GcdsContainer keeps its content hidden until it hydrates, and focus() on a
// hidden element silently does nothing. Pass a boolean for `ready`, not the
// data itself, so later updates (a save) don't pull focus back.
export const useFocusIdWhenReady = (id, ready) => {
  useEffect(() => {
    if (!id || !ready) return undefined;
    let frame;
    let tries = 0;
    const focusTarget = () => {
      const target = document.getElementById(id);
      if (target) {
        target.setAttribute('tabindex', '-1');
        target.classList.add('focus-target');
        target.focus();
        if (document.activeElement === target) return;
      }
      if (tries++ < 120) frame = requestAnimationFrame(focusTarget);
    };
    focusTarget();
    return () => cancelAnimationFrame(frame);
  }, [id, ready]);
};
