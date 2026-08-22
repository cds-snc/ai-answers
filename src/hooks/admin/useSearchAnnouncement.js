import { useState, useCallback, useRef } from 'react';

// Shared sr-only "search results changed" announcement + visible zero-result
// message, for any DataTable with a single global search box.
//
// Two tables need two different messages here:
//   - cheap-count tables (Chat/Metrics): know the exact row count, so we can
//     say "12 results found".
//   - expensive-count tables (Eval): only know the count would require a
//     real DB COUNT query, so we say the count-less "Search results
//     updated" instead. Pass `count: null` for this case.
//
// Previously hand-duplicated per-page as searchAnnouncement/
// searchAnnounceNonce/zeroResultNonce/previousSearchTermRef state.
export function useSearchAnnouncement({ t, fmtN }) {
  const [searchAnnouncement, setSearchAnnouncement] = useState('');
  const [searchAnnounceNonce, setSearchAnnounceNonce] = useState(0);
  const [zeroResultNonce, setZeroResultNonce] = useState(0);
  const previousSearchTermRef = useRef('');

  const noteSearchResult = useCallback((term, count) => {
    // Announcement: only on a genuinely new search term (not every redraw
    // of the same one — e.g. paging/sorting a still-active search), and
    // only when there's something to report (skip on 0: the visible
    // zero-result message below covers that case instead).
    const termChanged = term !== previousSearchTermRef.current;
    previousSearchTermRef.current = term;
    if (term && termChanged && count !== 0) {
      const message = count === null
        ? t('admin.common.searchResultsUpdatedAnnouncement')
        : t('admin.common.searchResultsAnnouncement').replace('{count}', () => fmtN(count));
      setSearchAnnouncement(message);
      setSearchAnnounceNonce((n) => n + 1);
    }

    // Zero-result message: bumped on every completion landing on zero, not
    // gated to "new term" — a 0-result page can't be paged further, so
    // there's no "just re-drawing the same query" case to filter out here.
    if (count === 0) {
      setZeroResultNonce((n) => n + 1);
    }
  }, [t, fmtN]);

  // For non-search-result announcements that reuse the same persistent
  // sr-only region (e.g. ChatDashboardPage.js's "Filters cleared").
  const announce = useCallback((message) => {
    setSearchAnnouncement(message);
    setSearchAnnounceNonce((n) => n + 1);
  }, []);

  // Called when a "Clear all" action resets the search box out from under
  // the table, so the next real search term (even if identical to one
  // typed before the clear) is treated as new.
  const reset = useCallback(() => {
    previousSearchTermRef.current = '';
  }, []);

  return { searchAnnouncement, searchAnnounceNonce, zeroResultNonce, noteSearchResult, announce, reset };
}
