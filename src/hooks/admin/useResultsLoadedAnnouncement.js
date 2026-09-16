import { useEffect, useRef } from 'react';
import { announce } from '../../utils/liveAnnouncer.js';

// The one completion announcement every dashboard makes, the same way:
// "Results loaded." once a fetch finishes with data. Nothing when it
// finishes with zero — the visible "no data" StatusMessage announces that
// case itself, and saying both would be contradictory. Nothing when it
// finishes with an error either: the hooks keep the previous metrics in
// place on failure, so `count` alone still looks like data — without the
// `error` check a failed refetch read "Results loaded." next to the error
// box. `count: null` (a table that has rows but no cheap count) counts as
// data, same as useSearchAnnouncement's noteLoadResult. Fires on each
// loading → not-loading transition, so a refetch (new filters, Clear all)
// announces again. Assertive: the user asked for this data and is waiting
// on it, so it interrupts whatever's being read rather than queueing.
//
// For dashboards whose fetch is a hook/state flag (Partner, Public,
// Metrics, Technical metrics). Dashboards whose fetch lives inside a
// DataTables ajax callback (Chat, Eval, AutoEval) call
// useSearchAnnouncement's noteLoadResult() / announce() at the same point
// instead.
export function useResultsLoadedAnnouncement({ loading, count, error, t }) {
  const wasLoadingRef = useRef(false);
  useEffect(() => {
    if (wasLoadingRef.current && !loading && !error && count !== 0 && count !== undefined) {
      announce(t('admin.common.resultsLoaded'), { assertive: true });
    }
    wasLoadingRef.current = loading;
  }, [loading, count, error, t]);
}
