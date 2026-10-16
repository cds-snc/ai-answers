import React, { useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import DataTable from 'datatables.net-react';
import 'datatables.net-dt/css/dataTables.dataTables.css';
import DT from 'datatables.net-dt';
import { dataTableLanguage } from '../../utils/dataTableLanguage.js';
import { escapeHtml } from '../../utils/htmlEscape.js';
import { announce } from '../../utils/liveAnnouncer.js';
import { useTranslations } from '../../hooks/useTranslations.js';
import LoadingOverlay from '../admin/LoadingOverlay.js';

DataTable.use(DT);

// The shared admin-table zones (docs/coding-agent-docs/tables.md): filter box
// top-left, page info and entries per page bottom-left, paging bottom-right.
const DEFAULT_LAYOUT = {
    topStart: 'search',
    topEnd: {},
    bottomStart: { features: ['pageLength', 'info'] },
    bottomEnd: { paging: { firstLast: false } }
};

export default function ExperimentalServerDataTable({
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
    actionsWidth,
    autoWidth = true,
    // sr-only label for the filter-style box (docs/coding-agent-docs/tables.md).
    layout = DEFAULT_LAYOUT,
    searchLabelSrOnly,
    searchPlaceholder
}) {
    const { t } = useTranslations(lang);
    const initialResultRef = useRef(initialResult);
    // Drives the scoped LoadingOverlay, as in ServerDataTable: DataTables'
    // own `processing` node is never announced by screen readers.
    const [loading, setLoading] = useState(true);
    const tableColumns = useMemo(() => {
        const normalizedColumns = columns.map(column => ({ defaultContent: '', ...column }));
        return renderActions
            ? [...normalizedColumns, { title: actionsTitle, data: null, orderable: false, searchable: false, defaultContent: '', ...(actionsWidth ? { width: actionsWidth } : {}) }]
            : normalizedColumns;
    }, [actionsTitle, actionsWidth, columns, renderActions]);

    const options = useMemo(() => ({
        serverSide: true,
        paging: true,
        searching: true,
        ordering: true,
        autoWidth,
        order,
        layout,
        language: {
            ...dataTableLanguage(lang),
            ...(emptyTableText ? { emptyTable: emptyTableText } : {}),
            ...(searchLabelSrOnly ? { search: `<span class="sr-only">${escapeHtml(searchLabelSrOnly)}</span>` } : {}),
            ...(searchPlaceholder ? { searchPlaceholder } : {})
        },
        ajax: async (params, callback) => {
            setLoading(true);
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

                callback({
                    draw: params.draw,
                    recordsTotal,
                    recordsFiltered,
                    data
                });
                setLoading(false);
                // Replaces the overlay's skippable "Loading…", as in ServerDataTable.
                announce(recordsFiltered === 0 ? t('admin.common.noData') : t('admin.common.resultsLoaded'), { assertive: true });
            } catch (error) {
                console.error('Failed to load experimental table data:', error);
                callback({ draw: params.draw, recordsTotal: 0, recordsFiltered: 0, data: [] });
                setLoading(false);
            }
        },
        createdRow: renderActions ? (row, rowData) => {
            const actionsCell = row.querySelector('td:last-child');
            if (!actionsCell) return;
            if (actionsCell._experimentalTableRoot) actionsCell._experimentalTableRoot.unmount();
            const root = createRoot(actionsCell);
            actionsCell._experimentalTableRoot = root;
            root.render(renderActions(rowData));
        } : undefined
    }), [autoWidth, emptyTableText, fetchData, lang, layout, order, renderActions, searchLabelSrOnly, searchPlaceholder, t, tableColumns]);

    return (
        // tabIndex: keyboard users can reach and scroll an overflowing table
        // (Safari/Firefox don't focus scroll regions on their own).
        <div className={containerClassName} tabIndex={0}>
            {/* Positioned, isolated ancestor that keeps the scoped overlay
                over this table only (see ServerDataTable). */}
            <div className="server-data-table-loading-wrapper">
                <DataTable
                    key={tableKey}
                    className="display dashboard-table zebra-stable-on-hover"
                    columns={tableColumns}
                    options={options}
                />
                {loading && <LoadingOverlay scoped message={t('common.loading')} />}
            </div>
        </div>
    );
}
