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
    const [groups, setGroups] = useState([]);
    const [counts, setCounts] = useState({ total: 0, attention: 0, errors: 0 });
    const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0, limit });
    const [filter, setFilterState] = useState(initialFilter);
    const [rowFilter, setRowFilter] = useState(openTarget);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // null = list view; otherwise index into the flattened items for the
    // selected chat group on the current page.
    const [selectedIndex, setSelectedIndex] = useState(null);
    // 'first' | 'last' — where to land after a page change triggered by next/prev
    const pendingSelectRef = useRef(null);
    // auto-open the first loaded item once, from the ?open deep link
    const pendingOpenRef = useRef(Boolean(openTarget));

    // Focus management for the list <-> detail transition. The consumer
    // attaches detailFocusRef to the first control in the detail view (e.g.
    // its "Back to list" button); this hook moves focus there on entering
    // detail, and restores focus to whatever triggered the selection when
    // returning to the list. Deliberately scoped to the null<->non-null edge
    // only (see the effect below) so next/prev navigation *within* the
    // detail view doesn't keep yanking focus away from the Next/Prev button
    // a keyboard user is repeatedly pressing.
    const detailFocusRef = useRef(null);
    const lastTriggerRef = useRef(null);
    const wasDetailOpenRef = useRef(false);

    const load = useCallback(async () => {
        if (!batchId) return;
        setLoading(true);
        setError(null);
        try {
            const result = await ExperimentalBatchClientService.getBatchItems(batchId, { page, limit, filter, row: rowFilter });
            setBatch(result.batch || null);
            setItems(result.items || []);
            setGroups(result.groups || (result.items || []).map(item => ({ chatId: item.chatId || null, items: [item] })));
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

    const selectItem = (index) => {
        // Only capture the trigger when coming from the list — a next/prev
        // click while already in detail view shouldn't overwrite it.
        if (selectedIndex === null && document.activeElement instanceof HTMLElement) {
            lastTriggerRef.current = document.activeElement;
        }
        setSelectedIndex(index);
    };

    // Move focus on the list<->detail edge only.
    useEffect(() => {
        const isDetailOpen = selectedIndex !== null;
        if (isDetailOpen && !wasDetailOpenRef.current) {
            detailFocusRef.current?.focus?.();
        } else if (!isDetailOpen && wasDetailOpenRef.current) {
            const trigger = lastTriggerRef.current;
            if (trigger && document.body.contains(trigger)) {
                trigger.focus();
            }
            lastTriggerRef.current = null;
        }
        wasDetailOpenRef.current = isDetailOpen;
    }, [selectedIndex]);

    const selectedGroupIndex = selectedIndex === null
        ? null
        : groups.findIndex(group => group.items.some(item => item === items[selectedIndex] || item._id === items[selectedIndex]?._id));
    const selectedGroup = selectedGroupIndex === null || selectedGroupIndex < 0
        ? null
        : groups[selectedGroupIndex];

    // Leaving the detail view also drops the deep-link row filter so the
    // full list is shown, not just one question's trials.
    const backToList = () => {
        setSelectedIndex(null);
        if (rowFilter) {
            setRowFilter(null);
            setPage(1);
        }
    };

    const positionInFilter = selectedGroupIndex === null || selectedGroupIndex < 0
        ? null
        : (pagination.page - 1) * pagination.limit + selectedGroupIndex + 1;

    const hasNext = selectedGroupIndex !== null
        && (selectedGroupIndex < groups.length - 1 || pagination.page < pagination.pages);
    const hasPrev = selectedGroupIndex !== null
        && (selectedGroupIndex > 0 || pagination.page > 1);

    const goNext = () => {
        if (!hasNext) return;
        if (selectedGroupIndex < groups.length - 1) {
            const nextGroupStart = groups.slice(0, selectedGroupIndex + 1)
                .reduce((count, group) => count + group.items.length, 0);
            setSelectedIndex(nextGroupStart);
        } else {
            pendingSelectRef.current = 'first';
            setPage(pagination.page + 1);
        }
    };

    const goPrev = () => {
        if (!hasPrev) return;
        if (selectedGroupIndex > 0) {
            const previousGroup = groups[selectedGroupIndex - 1];
            const previousGroupStart = groups.slice(0, selectedGroupIndex - 1)
                .reduce((count, group) => count + group.items.length, 0);
            setSelectedIndex(previousGroupStart);
        } else {
            pendingSelectRef.current = 'last';
            setPage(pagination.page - 1);
        }
    };

    return {
        batch,
        items,
        groups,
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
        selectedChatItems: selectedGroup?.items || [],
        positionInFilter,
        selectItem,
        backToList,
        goNext,
        goPrev,
        hasNext,
        hasPrev,
        detailFocusRef
    };
}

export default useExperimentalBatchItems;
