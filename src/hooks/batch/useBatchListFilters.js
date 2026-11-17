import { useEffect, useState } from 'react';
import BatchService from '../../services/BatchService.js';

const EMPTY = { institutions: [], groups: [], users: [] };

// Options for the admin batch scope dropdown. Skipped (stays empty) when
// `enabled` is false, so partners never call the admin-only endpoint.
export default function useBatchListFilters(enabled) {
  const [filters, setFilters] = useState(EMPTY);

  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    BatchService.getBatchListFilters()
      .then((data) => {
        if (cancelled) return;
        setFilters({
          institutions: Array.isArray(data?.institutions) ? data.institutions : [],
          groups: Array.isArray(data?.groups) ? data.groups : [],
          users: Array.isArray(data?.users) ? data.users : [],
        });
      })
      .catch((err) => {
        // The dropdown still offers "My batches" and "All users".
        console.error('Failed to load batch list filters:', err);
      });
    return () => { cancelled = true; };
  }, [enabled]);

  return filters;
}
