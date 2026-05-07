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
          render: (data) => new Date(data).toLocaleString(),
        },
        {
          title: t('logging.level'),
          data: 'logLevel',
          render: (data) => data ?? '',
        },
        {
          title: t('logging.message'),
          data: 'message',
          render: (data) => data ?? '',
        },
        {
          title: t('logging.metadata'),
          data: 'metadata',
          className: 'metadata-column',
          render: (data) => buildMetadataCellHtml(data, t('logging.expand')),
        },
      ],
      order: [[0, 'desc']],
      scrollX: true,
      pageLength: 50,
      language: dataTableLanguage(lang),
      drawCallback: function () {
        Prism.highlightAll();

        $('.metadata-wrapper').css({
          position: 'relative',
          'min-height': '50px',
          'max-height': '200px',
          display: 'flex',
          'flex-direction': 'column',
          width: '750px',
        });

        $('.metadata-content').css({
          flex: '1',
          'overflow-y': 'auto',
          'overflow-x': 'auto',
          position: 'relative',
          'background-color': '#f5f5f5',
          'border-radius': '4px',
          'max-width': '900px',
        });

        $('.metadata-content pre').css({
          margin: '0',
          padding: '8px',
          'min-width': 'fit-content',
          width: 'max-content',
        });

        $('.metadata-content code').css({
          'font-family': 'monospace',
          'font-size': '13px',
          'line-height': '1.4',
          'white-space': 'pre',
        });

        $('.metadata-actions').css({
          padding: '4px 0',
          'text-align': 'right',
        });

        $('.expand-button')
          .css({
            'margin-top': '4px',
            'font-size': '14px',
            padding: '4px 8px',
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
