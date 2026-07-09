import { useCallback, useEffect, useRef, useState } from 'react';
import { ExperimentalBatchClientService } from '../../services/experimental/ExperimentalBatchClientService.js';

const DEFAULT_LIMIT = 25;

/**
 * Loads paginated items for one experimental batch and manages the
 * review flow state: filter, page, and the currently selected item
 * (with next/previous that crosses page boundaries).
 */
export function useExperimentalBatchItems(batchId, { initialFilter = 'attention', limit = DEFAULT_LIMIT, openRowIndex = null } = {}) {
    // Deep link (?open=<rowIndex>): load only that question (all its trials,
    // any verdict) via the server-side row filter, and open the first one.
    const openTarget = Number.isInteger(openRowIndex) && openRowIndex > 0 ? openRowIndex : null;
    const [batch, setBatch] = useState(null);
    const [items, setItems] = useState([]);
    const [counts, setCounts] = useState({ total: 0, attention: 0, errors: 0 });
    const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0, limit });
    const [filter, setFilterState] = useState(initialFilter);
    const [rowFilter, setRowFilter] = useState(openTarget);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // null = list view; otherwise index into the current page's items
    const [selectedIndex, setSelectedIndex] = useState(null);
    // 'first' | 'last' — where to land after a page change triggered by next/prev
    const pendingSelectRef = useRef(null);
    // auto-open the first loaded item once, from the ?open deep link
    const pendingOpenRef = useRef(Boolean(openTarget));

    const load = useCallback(async () => {
        if (!batchId) return;
        setLoading(true);
        setError(null);
        try {
            const result = await ExperimentalBatchClientService.getBatchItems(batchId, { page, limit, filter, row: rowFilter });
            setBatch(result.batch || null);
            setItems(result.items || []);
            setCounts(result.counts || { total: 0, attention: 0, errors: 0 });
            setPagination(result.pagination || { page: 1, pages: 1, total: 0, limit });

            const itemCount = (result.items || []).length;
            if (pendingOpenRef.current) {
                if (itemCount > 0) setSelectedIndex(0);
                pendingOpenRef.current = false;
            } else if (pendingSelectRef.current && itemCount > 0) {
                setSelectedIndex(pendingSelectRef.current === 'last' ? itemCount - 1 : 0);
            } else if (pendingSelectRef.current) {
                setSelectedIndex(null);
            }
            pendingSelectRef.current = null;
        } catch (err) {
            console.error('Failed to load batch items:', err);
            setError(err.message || 'load-failed');
        } finally {
            setLoading(false);
        }
    }, [batchId, page, limit, filter, rowFilter]);

    useEffect(() => {
        load();
    }, [load]);

    const setFilter = (nextFilter) => {
        setFilterState(nextFilter);
        setRowFilter(null);
        setPage(1);
        setSelectedIndex(null);
    };

    const selectItem = (index) => setSelectedIndex(index);

    // Leaving the detail view also drops the deep-link row filter so the
    // full list is shown, not just one question's trials.
    const backToList = () => {
        setSelectedIndex(null);
        if (rowFilter) {
            setRowFilter(null);
            setPage(1);
        }
    };

    const positionInFilter = selectedIndex === null
        ? null
        : (pagination.page - 1) * pagination.limit + selectedIndex + 1;

    const hasNext = selectedIndex !== null
        && (selectedIndex < items.length - 1 || pagination.page < pagination.pages);
    const hasPrev = selectedIndex !== null
        && (selectedIndex > 0 || pagination.page > 1);

    const goNext = () => {
        if (!hasNext) return;
        if (selectedIndex < items.length - 1) {
            setSelectedIndex(selectedIndex + 1);
        } else {
            pendingSelectRef.current = 'first';
            setPage(pagination.page + 1);
        }
    };

    const goPrev = () => {
        if (!hasPrev) return;
        if (selectedIndex > 0) {
            setSelectedIndex(selectedIndex - 1);
        } else {
            pendingSelectRef.current = 'last';
            setPage(pagination.page - 1);
        }
    };

    return {
        batch,
        items,
        counts,
        pagination,
        filter,
        setFilter,
        page,
        setPage,
        loading,
        error,
        reload: load,
        selectedIndex,
        selectedItem: selectedIndex === null ? null : items[selectedIndex],
        positionInFilter,
        selectItem,
        backToList,
        goNext,
        goPrev,
        hasNext,
        hasPrev
    };
}

export default useExperimentalBatchItems;
