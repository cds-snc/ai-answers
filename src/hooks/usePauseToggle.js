import { useState, useRef, useCallback } from 'react';

/**
 * WCAG 2.2.2 (Pause, Stop, Hide) pause/resume toggle, shared by every
 * unconditional auto-refreshing admin table/poll (BatchList, SessionPage,
 * ExperimentalAnalysisPage's batch/comparison polling). Centralizing this
 * keeps the pause behaviour, labeling, and styling (via
 * <PauseToggleButton>) editable in one place instead of drifting per page.
 *
 * Returns `isPausedRef` alongside `isPaused` because the interval/poll this
 * guards is typically set up once in a useEffect with a stable dependency
 * array — reading `isPaused` state directly inside that closure would close
 * over a stale value, so the interval must check the ref on every tick
 * instead (`if (isPausedRef.current) return;`).
 *
 * @returns {{ isPaused: boolean, isPausedRef: import('react').RefObject<boolean>, togglePause: () => void }}
 */
export function usePauseToggle() {
  const [isPaused, setIsPaused] = useState(false);
  const isPausedRef = useRef(isPaused);
  isPausedRef.current = isPaused;

  const togglePause = useCallback(() => {
    setIsPaused((paused) => !paused);
  }, []);

  return { isPaused, isPausedRef, togglePause };
}
