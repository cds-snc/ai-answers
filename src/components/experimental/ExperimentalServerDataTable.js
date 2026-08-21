import React, { useMemo, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import DataTable from 'datatables.net-react';
import 'datatables.net-dt/css/dataTables.dataTables.css';
import DT from 'datatables.net-dt';
import { dataTableLanguage } from '../../utils/dataTableLanguage.js';

DataTable.use(DT);

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
    autoWidth = true
}) {
    const initialResultRef = useRef(initialResult);
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
        ordering: true,
        autoWidth,
        order,
        language: {
            ...dataTableLanguage(lang),
            ...(emptyTableText ? { emptyTable: emptyTableText } : {})
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

                callback({
                    draw: params.draw,
                    recordsTotal,
                    recordsFiltered,
                    data
                });
            } catch (error) {
                console.error('Failed to load experimental table data:', error);
                callback({ draw: params.draw, recordsTotal: 0, recordsFiltered: 0, data: [] });
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
    }), [autoWidth, emptyTableText, fetchData, lang, order, renderActions, tableColumns]);

    return (
        <div className={containerClassName}>
            <DataTable
                key={tableKey}
                className="display dashboard-table"
                columns={tableColumns}
                options={options}
            />
        </div>
    );
}
