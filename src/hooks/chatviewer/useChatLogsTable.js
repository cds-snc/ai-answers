import { useEffect, useRef } from 'react';
import $ from 'jquery';
// Registers $.fn.DataTable on the shared jQuery instance. Imported here rather
// than relied on as a side effect of whichever other page happens to be in the
// bundle — ChatViewer is the only consumer that drives DataTables through
// jQuery directly, so nothing else guarantees the plugin is attached.
import 'datatables.net-dt';
import Prism from 'prismjs';
import { buildMetadataCellHtml, escapeHtml } from '../../utils/chatviewer/chatViewer.js';
import { captureTableFocus, restoreTableFocus } from '../../utils/chatviewer/focusRestore.js';
import { dataTableLanguage } from '../../utils/dataTableLanguage.js';

// DataTables' column search takes one string, not an array - '^(warn|error)$'
// (regex mode) is how a multi-value "OR" match is expressed as that one
// string. Anchored full-match rather than a bare alternation: the Level
// column's rendered text is only ever the level word itself (see the Level
// column's own render()), so this never needs to guard against a false
// substring match elsewhere in the row the way an unanchored pattern would.
const buildLevelSearchPattern = (selectedLevels) =>
  selectedLevels.length > 0 ? `^(${selectedLevels.join('|')})$` : '';

export function useChatLogsTable({
  tableRef,
  logs,
  lang,
  selectedLevels,
  t,
  onDownloadLogs,
}) {
  const dataTableRef = useRef(null);
  const selectedLevelsRef = useRef(selectedLevels);
  // Ref rather than an effect dependency: ChatViewer.js's handleDownloadLogs
  // is a fresh function every render (not memoized), and the topEnd button
  // built below only needs whatever's current at click time - putting it in
  // deps instead would rebuild the whole DataTable (destroy+recreate, see
  // below) on every ChatViewer render, not just when logs/lang/t actually
  // change.
  const onDownloadLogsRef = useRef(onDownloadLogs);

  selectedLevelsRef.current = selectedLevels;
  onDownloadLogsRef.current = onDownloadLogs;

  useEffect(() => {
    if (!tableRef.current) {
      return undefined;
    }

    // See ../../utils/chatviewer/focusRestore.js for why this is keyed by
    // data-log-key rather than DOM position. tableRef.current itself gets
    // tabindex="-1" as restoreTableFocus's last-resort landing spot when
    // the exact element can't be recovered (e.g. the row no longer exists,
    // or there are no logs).
    const focusRestore = captureTableFocus(tableRef.current);
    tableRef.current.setAttribute('tabindex', '-1');

    if (dataTableRef.current) {
      dataTableRef.current.destroy();
      dataTableRef.current = null;
    }

    // Build the table even with zero logs, rather than swapping it out for
    // a separate "no logs" element — DataTables shows its own localized
    // empty state (emptyTable, overridden below with our own copy) in the
    // tbody. Keeping the table itself mounted regardless of row count is
    // what lets the focus-capture above ever run in the first place: if
    // ChatViewer instead unmounted <table> when logs is empty, React would
    // remove it (and null tableRef.current) in the same commit that this
    // effect's own logs-changed run is triggered by, before this effect's
    // code — including the capture at the top of this function — had any
    // chance to execute against a still-attached element.
    dataTableRef.current = $(tableRef.current).DataTable({
      data: logs,
      createdRow: (row, rowData) => {
        row.dataset.logKey = `${rowData.createdAt}|${rowData.message}`;
      },
      columns: [
        {
          title: t('logging.createdAt'),
          data: 'createdAt',
          width: '12%',
          render: (data) => new Date(data).toLocaleString(),
        },
        {
          title: t('logging.level'),
          data: 'logLevel',
          width: '7%',
          // .label pill - logLevel's own values (info/debug/warn/error) are
          // used directly as the class name, reusing the existing severity
          // tiers already in admin.css (.label.info/.warn/.error/.debug)
          // rather than a separate log-level-* set of colours. logLevel is
          // enum-constrained (models/logs.js), but this still escapes it -
          // a storage-path log entry (Storage.js/S3, not Mongoose) never
          // went through that schema's validation.
          render: (data) => {
            if (!data) return '';
            const safe = escapeHtml(data);
            return `<span class="label ${safe}">${safe}</span>`;
          },
        },
        {
          title: t('logging.message'),
          data: 'message',
          width: '28%',
          render: (data) => data ?? '',
        },
        {
          title: t('logging.metadata'),
          data: 'metadata',
          className: 'metadata-column',
          width: '53%',
          // Every field shown, each judged on its own length rather than a
          // pair-count cutoff - see buildMetadataCellHtml for the details.
          render: (data) =>
            buildMetadataCellHtml(data, {
              seeFullFieldLabel: t('logging.metadataSeeFullField'),
              seeFullValueLabel: t('logging.metadataSeeFullValue'),
            }),
        },
      ],
      order: [[0, 'desc']],
      autoWidth: false,
      scrollX: false,
      pageLength: 50,
      searching: true,
      // Matches ChatDashboardPage.js/EvalDashboardPage.js's layout (search
      // top-left, count+page-length bottom-left, pagination bottom-right),
      // using topEnd for the Download action next to the search box. A
      // DataTables layout value can be a function returning a DOM/jQuery
      // node - built as a jQuery template since this table isn't
      // React-rendered content (icon markup matches BatchList.js's download
      // action; GC DS's icon font has no download glyph).
      layout: {
        topStart: 'search',
        topEnd:
          logs.length > 0
            ? function () {
                const $button = $(
                  `<gcds-button type="button" button-role="secondary" id="download-logs-button">` +
                    `<span style="display:inline-flex;align-items:center;gap:0.4em;">` +
                    `<span class="fa fa-solid fa-download" aria-hidden="true"></span>` +
                    `${escapeHtml(t('logging.download'))}` +
                    `</span>` +
                    `</gcds-button>`
                );
                $button.on('click', () => onDownloadLogsRef.current?.());
                return $button;
              }
            : {},
        bottomStart: { features: ['pageLength', 'info'] },
        bottomEnd: 'paging',
      },
      language: {
        ...dataTableLanguage(lang),
        emptyTable: t('logging.noLogs'),
        // Reuses admin.common's generic "Search:" label, matching
        // ChatDashboardPage.js/EvalDashboardPage.js - but not its
        // searchPlaceholder ("e.g. tax, contact, account"), which is tuned
        // for those pages' department/program search and wouldn't fit
        // searching log messages/levels/metadata here.
        search: t('admin.common.searchLabel'),
      },
      drawCallback: function () {
        // Scoped to this table - no <code> blocks exist outside it.
        Prism.highlightAllUnder(tableRef.current);

        $(tableRef.current).css({
          width: '100%',
          'table-layout': 'fixed',
        });

        $(tableRef.current).find('td').css({
          'vertical-align': 'top',
        });

        $(tableRef.current).find('td:nth-child(3)').css({
          'white-space': 'normal',
          'overflow-wrap': 'anywhere',
        });
      },
    });

    if (selectedLevelsRef.current.length > 0 && dataTableRef.current) {
      dataTableRef.current.column(1).search(buildLevelSearchPattern(selectedLevelsRef.current), true, false).draw();
    }

    restoreTableFocus(tableRef.current, focusRestore);

    return () => {
      if (dataTableRef.current) {
        dataTableRef.current.destroy();
        dataTableRef.current = null;
      }
    };
  }, [lang, logs, t, tableRef]);

  useEffect(() => {
    if (!dataTableRef.current) {
      return;
    }

    dataTableRef.current.column(1).search(buildLevelSearchPattern(selectedLevels), true, false).draw();
  }, [selectedLevels]);

  return dataTableRef;
}
