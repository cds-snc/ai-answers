import { useEffect, useRef } from 'react';
import $ from 'jquery';
import Prism from 'prismjs';
import { buildMetadataCellHtml } from '../../utils/chatviewer/chatViewer.js';
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

    if (dataTableRef.current) {
      dataTableRef.current.destroy();
      dataTableRef.current = null;
    }

    if (!logs?.length) {
      return undefined;
    }

    dataTableRef.current = $(tableRef.current).DataTable({
      data: logs,
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
      language: dataTableLanguage(lang),
      drawCallback: function () {
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
