import { useCallback, useEffect, useRef, useState } from 'react';
import ScenarioOverrideService from '../../services/ScenarioOverrideService.js';
import { useAuth } from '../../contexts/AuthContext.js';

// Backs the chat-page "a local scenario override is applied" banner
// (issue #1048).
//
// Gated on AuthContext's `currentUser`/`loading`, not just fired on mount:
// AuthProvider (App.js) runs its own async AuthService.getCurrentUser() on
// mount to populate both its React context state *and*
// AuthService.currentUser (the static flag ScenarioOverrideService's
// _isAuthenticated() reads). Firing our own fetch unconditionally on mount
// raced that — on a fresh tab/page load, AuthContext's check almost always
// hadn't resolved yet, so _isAuthenticated() read the still-null static
// flag and this hook gave up permanently (no retry until the next
// focus/visibilitychange), even though the user genuinely was signed in
// moments later. Waiting for AuthContext's own `loading` to clear removes
// the race entirely — RoleBasedContent (src/components/RoleBasedUI.js),
// which correctly shows/hides ChatOptions on a fresh tab, uses the same
// `useAuth()` source of truth for exactly this reason.
//
// Refetches on window focus/visibilitychange, not just on mount: the
// realistic workflow is a partner/admin tab-swapping between this chat tab
// and the Scenario overrides editor in another tab, saving there, then
// swapping back — the banner needs to pick that up without a manual reload.
// getActiveOverrideSummary() itself always bypasses ScenarioOverrideService's
// cache (cache: 'no-store'), so a same-tab refetch can't return a stale
// cached value either.
// `enabled: false` (e.g. ChatViewer's read-only review mode, which never
// renders the banner) skips the fetch and the focus/visibility listeners
// entirely, rather than fetching on every admin page view for a result
// that's never displayed.
export function useActiveScenarioOverride({ enabled = true } = {}) {
  const { currentUser, loading: authLoading } = useAuth() || {};
  const [activeOverride, setActiveOverride] = useState(null);

  // Both the `focus` and `visibilitychange` listeners below call refresh(),
  // deliberately — browsers don't consistently fire one without the other
  // across a real tab-switch-back and an OS-level app-switch-back, so both
  // are kept for coverage. But on the common case (switching back to this
  // tab) both fire for the *same* user action, which would otherwise double
  // the getActiveOverrideSummary() fetch. This in-flight guard makes the
  // second, near-simultaneous call a no-op instead.
  const refreshingRef = useRef(false);
  const refresh = useCallback(async () => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    try {
      const active = await ScenarioOverrideService.getActiveOverrideSummary();
      setActiveOverride(active);
    } finally {
      refreshingRef.current = false;
    }
  }, []);

  // Boolean(currentUser), not currentUser itself, in the dependency array:
  // AuthContext's own window-focus handler calls revalidateSession() ->
  // setCurrentUser(freshUserObject) on every focus, which is a *new object
  // reference* each time even though "signed in" hasn't actually changed.
  // Depending on currentUser directly tore this whole effect down and
  // re-ran it (a fresh fetch) on every focus, on top of the `focus`
  // listener registered below also firing from the very same event — two
  // getActiveOverrideSummary() calls per focus, for the life of the page.
  // Keying on the boolean instead only re-runs the effect on an actual
  // sign-in/sign-out transition, leaving the listener as the single fetch.
  const isSignedIn = Boolean(currentUser);

  useEffect(() => {
    if (!enabled || authLoading) return undefined;
    if (!isSignedIn) {
      setActiveOverride(null);
      return undefined;
    }

    let cancelled = false;
    (async () => {
      const active = await ScenarioOverrideService.getActiveOverrideSummary();
      if (!cancelled) setActiveOverride(active);
    })();

    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [enabled, authLoading, isSignedIn, refresh]);

  return { activeOverride };
}

export default useActiveScenarioOverride;
