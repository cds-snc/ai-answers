import React, { forwardRef, useImperativeHandle, useMemo, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import DataTable from 'datatables.net-react';
import 'datatables.net-dt/css/dataTables.dataTables.css';
import DT from 'datatables.net-dt';
import { dataTableLanguage } from '../../utils/dataTableLanguage.js';
import { escapeHtml } from '../../utils/htmlEscape.js';

DataTable.use(DT);

// The stable, shared server-side DataTable wrapper — SettingsPage.js is its
// first consumer. Every other server-side table in the app (ChatDashboardPage,
// EvalDashboardPage, AutoEvalDashboardPage, SessionPage, UsersPage,
// PublicEvalPage) still hand-rolls its own DataTable.use(DT)/columns/options/
// ajax wiring; components/experimental/ExperimentalServerDataTable.js is a
// second, near-identical wrapper used only by the two experimental pages.
//
// TODO: migrate those other pages onto this component (and consider whether
// ExperimentalServerDataTable should just re-export or wrap this one, or stay
// fully separate) once its prop shape has proven itself across more than one
// caller. Deliberately not done in the same change that introduces it —
// SettingsPage.js is this component's first real usage, and each of those
// other pages has its own accumulated per-page behavior (ChatDashboardPage's
// stateSave/localStorage persistence and filter-driven ajax params in
// particular) that needs its own careful migration, not a single sweeping
// rename. This component's location (components/admin/, not
// components/experimental/) is deliberate: it's meant to be safe for a
// production page to depend on without every experimental-page change also
// having to consider "does this break Settings/Chat dashboard/etc.?"
const ServerDataTable = forwardRef(function ServerDataTable({
    columns,
    fetchData,
    lang = 'en',
    actionsTitle,
    renderActions,
    tableKey,
    order = [],
    containerClassName = 'experimental-table-container',
    initialResult = null,
    emptyTableText,
    // Visually just a placeholder box (e.g. "Filter"), like the chat
    // viewer's log entries table: the <label> DataTables builds keeps this
    // text sr-only so the input still has an accessible name.
    searchLabelSrOnly,
    searchPlaceholder,
    // sr-only <caption> naming the table for screen readers.
    caption,
    actionsWidth,
    autoWidth = true,
    ordering = true,
    pageLength = 10,
    lengthChange = true,
    layout,
    onError
}, ref) {
    const initialResultRef = useRef(initialResult);
    // The live DataTables API instance, captured via initComplete (the same
    // pattern ChatDashboardPage.js already uses) rather than a ref on
    // <DataTable> itself, since datatables.net-react doesn't forward one.
    const tableApiRef = useRef(null);

    // Exposes an imperative reload() to the caller — a re-fetch of the
    // current page/search/sort without tearing the widget down, unlike
    // bumping `tableKey` (which forces a full unmount/remount and silently
    // resets whatever the admin had typed into the search box or paged to).
    // tableKey is still supported for cases that genuinely need a full
    // rebuild (e.g. a columns/schema change) — reload() is for "the same
    // shape of data changed server-side, show it."
    useImperativeHandle(ref, () => ({
        reload: () => {
            // `false` preserves the current page instead of resetting to page 1.
            tableApiRef.current?.ajax.reload(null, false);
        }
    }), []);
    const tableColumns = useMemo(() => {
        const normalizedColumns = columns.map(column => ({ defaultContent: '', ...column }));
        return renderActions
            ? [...normalizedColumns, { title: actionsTitle, data: null, orderable: false, searchable: false, defaultContent: '', ...(actionsWidth ? { width: actionsWidth } : {}) }]
            : normalizedColumns;
    }, [actionsTitle, actionsWidth, columns, renderActions]);

    const options = useMemo(() => ({
        processing: true,
        serverSide: true,
        paging: true,
        searching: true,
        ordering,
        pageLength,
        lengthChange,
        autoWidth,
        order,
        // DataTables 2's default layout puts the length menu top-left and the
        // search box top-right. A caller can override either slot (e.g. to
        // put search on the left once there's no length menu to sit next to
        // it) without this component hardcoding one specific arrangement.
        // No first/last « » paging buttons (GC DS pagination has none - see
        // admin.css); a caller's layout can still override any slot.
        layout: { bottomEnd: { paging: { firstLast: false } }, ...(layout || {}) },
        language: {
            ...dataTableLanguage(lang),
            ...(emptyTableText ? { emptyTable: emptyTableText } : {}),
            ...(searchLabelSrOnly ? { search: `<span class="sr-only">${escapeHtml(searchLabelSrOnly)}</span>` } : {}),
            ...(searchPlaceholder ? { searchPlaceholder } : {})
        },
        ajax: async (params, callback) => {
            try {
                const sort = params.order?.[0];
                const result = initialResultRef.current || await fetchData({
                    start: params.start || 0,
                    length: params.length || 10,
                    search: params.search?.value || '',
                    orderBy: sort ? tableColumns[sort.column]?.data : '',
                    orderDir: sort?.dir || 'desc'
                });
                initialResultRef.current = null;
                const data = Array.isArray(result.data) ? result.data : [];
                const recordsTotal = Number.isFinite(result.recordsTotal)
                    ? result.recordsTotal
                    : (Number.isFinite(result.pagination?.total) ? result.pagination.total : data.length);
                const recordsFiltered = Number.isFinite(result.recordsFiltered)
                    ? result.recordsFiltered
                    : (Number.isFinite(result.pagination?.total) ? result.pagination.total : data.length);

                onError?.(null);
                callback({
                    draw: params.draw,
                    recordsTotal,
                    recordsFiltered,
                    data
                });
            } catch (error) {
                // Previously: swallowed into an empty result with only a
                // console.error — a genuine fetch failure and "this table
                // has zero rows" were indistinguishable to the admin, since
                // both render emptyTableText. onError hands the raw error
                // up so a caller can show it (see SettingsPage.js's audit
                // history for the reference usage) instead of just logging
                // it; onError?.(null) above clears a stale error once a
                // later fetch (e.g. a retry) succeeds.
                console.error('Failed to load table data:', error);
                onError?.(error);
                callback({ draw: params.draw, recordsTotal: 0, recordsFiltered: 0, data: [] });
            }
        },
        createdRow: renderActions ? (row, rowData) => {
            const actionsCell = row.querySelector('td:last-child');
            if (!actionsCell) return;
            if (actionsCell._serverDataTableRoot) actionsCell._serverDataTableRoot.unmount();
            const root = createRoot(actionsCell);
            actionsCell._serverDataTableRoot = root;
            root.render(renderActions(rowData));
        } : undefined,
        initComplete: function () {
            tableApiRef.current = this.api();
        }
    }), [autoWidth, emptyTableText, fetchData, lang, layout, lengthChange, onError, order, ordering, pageLength, renderActions, searchLabelSrOnly, searchPlaceholder, tableColumns]);

    return (
        // tabIndex makes this reachable by keyboard when its content overflows
        // horizontally (a wide table, or a narrow viewport) — without it, a
        // keyboard user has no way to scroll the table into view sideways.
        <div className={containerClassName} tabIndex={0}>
            <DataTable
                key={tableKey}
                className="display dashboard-table zebra-stable-on-hover"
                columns={tableColumns}
                options={options}
            >
                {caption ? <caption className="sr-only">{caption}</caption> : null}
            </DataTable>
        </div>
    );
});

export default ServerDataTable;
