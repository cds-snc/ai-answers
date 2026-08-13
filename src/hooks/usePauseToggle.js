import { useState, useRef, useCallback, useEffect } from 'react';

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
 * instead. `guardPoll(fn)` wraps a poll callback with that check so call
 * sites that manage their own interval (e.g. ExperimentalAnalysisPage's
 * conditional, self-restarting poll) don't each repeat
 * `if (isPausedRef.current) return;` inline. Call sites with a plain
 * "fetch on mount, then every N ms" poll (BatchList, SessionPage) should use
 * `usePausablePolling` below instead, which owns the interval too.
 *
 * @returns {{ isPaused: boolean, isPausedRef: import('react').RefObject<boolean>, togglePause: () => void, guardPoll: (fn: () => void) => () => void }}
 */
export function usePauseToggle() {
  const [isPaused, setIsPaused] = useState(false);
  const isPausedRef = useRef(isPaused);
  isPausedRef.current = isPaused;

  const togglePause = useCallback(() => {
    setIsPaused((paused) => !paused);
  }, []);

  const guardPoll = useCallback((fn) => () => {
    if (isPausedRef.current) return;
    fn();
  }, []);

  return { isPaused, isPausedRef, togglePause, guardPoll };
}

/**
 * Fixed-interval polling with a WCAG 2.2.2 pause toggle: calls `fn` once
 * immediately and then every `intervalMs`, skipping ticks while paused,
 * with cleanup on unmount — the "fetch on mount, then keep refreshing"
 * shape shared by BatchList and SessionPage. `deps` controls when the
 * effect (and so which closure of `fn`) restarts, same as a hand-written
 * `useEffect` would; pass the same dependency array you'd have used there.
 *
 * ExperimentalAnalysisPage's poll starts/stops conditionally based on
 * fetched data rather than on mount, so it uses `usePauseToggle` +
 * `guardPoll` directly instead of this hook.
 *
 * @param {() => void} fn - called on mount/dep-change and every intervalMs, unless paused
 * @param {number} intervalMs
 * @param {React.DependencyList} deps
 * @returns {{ isPaused: boolean, togglePause: () => void }}
 */
export function usePausablePolling(fn, intervalMs, deps) {
  const { isPaused, togglePause, guardPoll } = usePauseToggle();

  useEffect(() => {
    fn();
    const intervalId = setInterval(guardPoll(fn), intervalMs);
    return () => clearInterval(intervalId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { isPaused, togglePause };
}
