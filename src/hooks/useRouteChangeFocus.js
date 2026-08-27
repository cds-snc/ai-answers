import { useEffect, useRef } from 'react';

// Moves focus to the returned ref's element whenever `routeKey` changes via
// a client-side route transition (react-router's navigate()) - a real page
// load already gets this for free from the browser, so it only matters for
// navigate(). Pass `location.key`, not `location.pathname`: a fresh key is
// assigned on every navigation even when the pathname doesn't change (e.g. a
// query-string-only navigate()), so a pathname-keyed effect would silently
// miss that case. Skips the first render (a fresh mount, not a route change).
//
// Backs off if a child has already moved focus inside the target by the
// time this runs (effects fire child-before-parent, so a child's own
// mount-time autofocus wins the race). Only catches a *synchronous* child
// autofocus though - `skip` exists for the async case: ChatInterface.js's
// textarea autofocus deliberately waits on customElements.whenDefined +
// componentOnReady (so VoiceOver's read-from-top isn't interrupted
// mid-hydration), so its route opts out entirely instead of racing it.
//
// `skip` also covers an unrelated case: a route that just shouldn't get this
// treatment (the post-login landing page - a fresh sign-in should load
// normally, not force focus into its heading). See App.js's `skipRouteFocus`.
export const useRouteChangeFocus = (routeKey, { skip = false } = {}) => {
  const ref = useRef(null);
  const isInitialMount = useRef(true);

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    if (skip) return;
    const el = ref.current;
    if (!el) return;
    // TODO(a11y): this back-off is sync-only, and can be defeated by more
    // than the async case documented above - a child's own mount-time
    // useEffect that moves focus via a *state update* (e.g.
    // ResetCompletePage.js's invalidLinkCount -> useFocusOnChange) also runs
    // after this effect, for the same "effects run child-before-parent, but
    // this one still isn't done yet" reason. Confirmed latent, not live
    // today - ResetCompletePage.js isn't currently reached via navigate() -
    // but the gap is real for the next page that reuses this pattern.
    // Flagged by code review on PR #1765; not fixed there since nothing
    // reachable today hits it. A related question - whether this back-off
    // also needs to catch a fully *async* child autofocus, not just a
    // synchronous or mount-time-state one - was raised and closed earlier in
    // that same PR's review: no other page-level autofocus besides the chat
    // textarea (which already opts out via `skip`, see above) was planned,
    // so that broader case wasn't worth generalizing for.
    if (document.activeElement && el.contains(document.activeElement)) {
      return;
    }
    el.focus();
  }, [routeKey, skip]);

  return ref;
};
