import { useEffect, useRef } from 'react';

// Focuses `targetRef` when `isOpen` transitions from true to false (the user
// closed a disclosure/panel) — not on initial mount, when nothing was ever
// open. Mirrors useFocusOnChange but for the closing edge, so focus returns
// to the control that opened the panel instead of being lost to <body> when
// the panel unmounts.
export const useReturnFocusOnClose = (isOpen, targetRef) => {
  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (!isOpen && wasOpenRef.current) {
      targetRef.current?.focus();
    }
    wasOpenRef.current = isOpen;
  }, [isOpen, targetRef]);
};
