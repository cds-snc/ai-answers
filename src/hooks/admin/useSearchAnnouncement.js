import { useState, useCallback, useRef } from 'react';
import { announce as liveAnnounce } from '../../utils/liveAnnouncer.js';

// Shared "search results changed" announcement + visible zero-result
// message, for any DataTable with a single global search box.
//
// Two tables need two different messages here:
//   - cheap-count tables (Chat/Metrics): know the exact row count, so we can
//     say "12 results found".
//   - expensive-count tables (Eval): only know the count would require a
//     real DB COUNT query, so we say the count-less "Search results
//     updated" instead. Pass `count: null` for this case.
//
// Announcements go straight to the shared live announcer
// (src/utils/liveAnnouncer.js) — there's no sr-only StatusMessage to render
// for them any more. `zeroResultNonce` is still state: it drives the
// visible "no results" StatusMessage's re-announcement when a second search
// also lands on zero.
export function useSearchAnnouncement({ t, fmtN }) {
  const [zeroResultNonce, setZeroResultNonce] = useState(0);
  const previousSearchTermRef = useRef('');

  const noteSearchResult = useCallback((term, count) => {
    // Announcement: only on a genuinely new search term (not every redraw
    // of the same one — e.g. paging/sorting a still-active search), and
    // only when there's something to report (skip on 0: the visible
    // zero-result message below covers that case instead).
    const termChanged = term !== previousSearchTermRef.current;
    previousSearchTermRef.current = term;
    let announced = false;
    if (term && termChanged && count !== 0) {
      liveAnnounce(count === null
        ? t('admin.common.searchResultsUpdatedAnnouncement')
        : t('admin.common.searchResultsAnnouncement').replace('{count}', () => fmtN(count)));
      announced = true;
    }

    // Zero-result message: bumped on every completion landing on zero, not
    // gated to "new term" — a 0-result page can't be paged further, so
    // there's no "just re-drawing the same query" case to filter out here.
    if (count === 0) {
      setZeroResultNonce((n) => n + 1);
    }
    // Returns whether it spoke, so the caller can skip noteLoadResult() for
    // the same fetch — "12 results found" already says the load finished;
    // adding an assertive "Results loaded." read the two back to back, in
    // the wrong order.
    return announced;
  }, [t, fmtN]);

  // The one completion announcement every dashboard makes: "Results
  // loaded." when a fetch finishes with data, nothing on zero (the visible
  // "no data" StatusMessage announces that itself). Call it from the same
  // place the table's ajax callback learns the count, only when
  // noteSearchResult() didn't already announce that fetch. `count: null`
  // (Eval's synthetic count) is treated as "has data". Assertive: the user
  // asked for this data and is waiting on it, so it interrupts rather
  // than queues (same as useResultsLoadedAnnouncement).
  const noteLoadResult = useCallback((count) => {
    if (count === 0) return;
    liveAnnounce(t('admin.common.resultsLoaded'), { assertive: true });
  }, [t]);

  // For a page's other, non-search announcements (e.g. ChatDashboardPage.js's
  // "Filters cleared") — same announcer, kept here so callers get one
  // import.
  const announce = useCallback((message) => {
    liveAnnounce(message);
  }, []);

  // Called when a "Clear all" action resets the search box out from under
  // the table, so the next real search term (even if identical to one
  // typed before the clear) is treated as new.
  const reset = useCallback(() => {
    previousSearchTermRef.current = '';
  }, []);

  return { zeroResultNonce, noteSearchResult, noteLoadResult, announce, reset };
}
