import { useEffect, useRef } from 'react';
import $ from 'jquery';
// Registers $.fn.DataTable on the shared jQuery instance. Imported here rather
// than relied on as a side effect of whichever other page happens to be in the
// bundle — ChatViewer is the only consumer that drives DataTables through
// jQuery directly, so nothing else guarantees the plugin is attached.
import 'datatables.net-dt';
import Prism from 'prismjs';
import { buildMetadataCellHtml } from '../../utils/chatviewer/chatViewer.js';
import { captureTableFocus, restoreTableFocus } from '../../utils/chatviewer/focusRestore.js';
import { dataTableLanguage } from '../../utils/dataTableLanguage.js';

export function useChatLogsTable({
  tableRef,
  logs,
  lang,
  logLevel,
  t,
  onExpandMetadata,
}) {
  const dataTableRef = useRef(null);
  const logLevelRef = useRef(logLevel);

  logLevelRef.current = logLevel;

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
          render: (data) => data ?? '',
        },
        {
          title: t('logging.message'),
          data: 'message',
          width: '25%',
          render: (data) => data ?? '',
        },
        {
          title: t('logging.metadata'),
          data: 'metadata',
          className: 'metadata-column',
          width: '56%',
          render: (data) => buildMetadataCellHtml(data, t('logging.expand')),
        },
      ],
      order: [[0, 'desc']],
      autoWidth: false,
      scrollX: false,
      pageLength: 50,
      language: { ...dataTableLanguage(lang), emptyTable: t('logging.noLogs') },
      drawCallback: function () {
        // TODO(follow-up, PR #1684 review): document-scoped, so a logs-table
        // redraw while MetadataModal is open also re-highlights the modal's
        // own <code> block from outside React. MetadataModal's rewrite to
        // dangerouslySetInnerHTML was specifically meant to make React the
        // only writer of that markup — this doesn't corrupt it (Prism's
        // re-tokenization of already-highlighted markup is idempotent), but it
        // contradicts that invariant and does wasted work on every redraw.
        // Scope with Prism.highlightAllUnder(tableRef.current) instead.
        Prism.highlightAll();

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

        $('.metadata-wrapper').css({
          position: 'relative',
          display: 'block',
          width: '100%',
          'min-width': '0',
          'max-width': '100%',
          'min-height': '200px',
          'box-sizing': 'border-box',
          'vertical-align': 'top',
          overflow: 'visible',
        });

        $('.metadata-column').css({
          'vertical-align': 'top',
          overflow: 'visible',
        });

        $('.metadata-content').css({
          position: 'relative',
          height: '200px',
          'min-height': '200px',
          'max-height': '200px',
          overflow: 'scroll',
          'overflow-x': 'scroll',
          'overflow-y': 'scroll',
          'scrollbar-gutter': 'stable both-edges',
          width: '100%',
          'min-width': '0',
          'max-width': '100%',
          'box-sizing': 'border-box',
          'background-color': '#f5f5f5',
          'border-radius': '4px',
        });

        $('.metadata-content pre').css({
          margin: '0',
          padding: '8px',
          'min-width': 'max-content',
          'min-height': '260px',
          width: 'max-content',
        });

        $('.metadata-content code').css({
          'font-family': 'monospace',
          'font-size': '13px',
          'line-height': '1.4',
          'white-space': 'pre',
        });

        $('.expand-button')
          .css({
            position: 'absolute',
            top: '6px',
            right: '24px',
            'z-index': '3',
            'font-size': '14px',
            padding: '4px 8px',
            'line-height': '1.2',
            'white-space': 'nowrap',
            'background-color': '#fff',
          })
          .off('click')
          .on('click', function (e) {
            e.stopPropagation();
            const tr = $(this).closest('tr');
            const rowData = dataTableRef.current.row(tr).data();
            onExpandMetadata(rowData.metadata);
          });
      },
    });

    if (logLevelRef.current && dataTableRef.current) {
      dataTableRef.current.column(1).search(logLevelRef.current, false, false).draw();
    }

    restoreTableFocus(tableRef.current, focusRestore);

    return () => {
      if (dataTableRef.current) {
        dataTableRef.current.destroy();
        dataTableRef.current = null;
      }
    };
  }, [lang, logs, onExpandMetadata, t, tableRef]);

  useEffect(() => {
    if (!dataTableRef.current) {
      return;
    }

    dataTableRef.current.column(1).search(logLevel, false, false).draw();
  }, [logLevel]);

  return dataTableRef;
}
