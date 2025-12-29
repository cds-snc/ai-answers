import React, { useState } from 'react';
import { GcdsButton } from '@cdssnc/gcds-components-react';
import '../../styles/App.css';
import MetricsService from '../../services/MetricsService.js';
import DataTable from 'datatables.net-react';
import DT from 'datatables.net-dt';
import ExportService from '../../services/ExportService.js';
import { useTranslations } from '../../hooks/useTranslations.js';
import FilterPanel from './FilterPanel.js';

DataTable.use(DT);

const FILTER_PANEL_STORAGE_KEY = 'chatLogsFilterPanelState_v1';

const ChatLogsDashboard = ({ lang = 'en' }) => {
  const { t } = useTranslations(lang);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [hasLoadedData, setHasLoadedData] = useState(false);
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [, _setProgress] = useState('0%');
  const [totalCount, setTotalCount] = useState(0);

  // Helper function to truncate admin page URL
  const truncateAdminUrl = (url) => {
    if (!url) return '';
    try {
      const urlObj = new URL(url);
      return urlObj.pathname;
    } catch {
      return url;
    }
  };

  // Helper function to truncate email
    const truncateEmail = (email) => {
    if (!email) return '';
    return email.split('@')[0];
  };

const columns = [
  {
    title: t('admin.chatLogs.columns.chatId') || 'Chat ID',
    data: 'chatId',
    render: (data) => data || ''
  },
  {
    title: t('admin.chatLogs.columns.department') || 'Department',
    data: 'department',
    render: (data) => data || ''
  },
  {
    title: t('admin.chatLogs.columns.pageLanguage') || 'Page',
    data: 'pageLanguage',
    render: (value) => {
      if (!value) return '';
      const normalized = value.toLowerCase().includes('fr') ? 'FR' : 'EN';
      return normalized;
    }
  },
  {
    title: t('admin.chatLogs.columns.expertEmail') || 'Expert Email',
    data: 'expertEmail',
    render: (data) => truncateEmail(data)
  },
  {
    title: t('admin.chatLogs.columns.creatorEmail') || 'Creator Email',
    data: 'creatorEmail',
    render: (data) => truncateEmail(data)
  },
  {
    title: t('admin.chatLogs.columns.date') || 'Date',
    data: 'date',
    render: (data) => {
      if (!data) return '';
      const date = new Date(data);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      return `${year}/${month}/${day}<br/>${hours}:${minutes}`;
    }
  },
  {
    title: t('admin.chatLogs.columns.referringUrl') || 'Referring URL',
    data: 'referringUrl',
    render: (data) => {
      if (!data) return '<span style="font-style: italic; color: #666;">none</span>';
      const truncated = truncateAdminUrl(data);
      return truncated;
    }
  },
  {
    title: t('admin.chatLogs.columns.userType') || 'User Type',
    data: 'userType',
    render: (data) => {
      const type = data || 'public';
      return `<span class="label ${type}">${type}</span>`;
    }
  },
  {
    title: t('admin.chatLogs.columns.answerType') || 'Answer Type',
    data: 'answerType',
    render: (data) => {
      const type = data || 'normal';
      return `<span class="label ${type}">${type}</span>`;
    }
  },
  {
    title: t('admin.chatLogs.columns.partnerEval') || 'Partner Eval',
    data: 'partnerEval',
    render: (data) => {
      if (!data) return '';
      return `<span class="label ${data}">${data}</span>`;
    }
  },
  {
    title: t('admin.chatLogs.columns.aiEval') || 'AI Eval',
    data: 'aiEval',
    render: (data) => {
      if (!data) return '';
      return `<span class="label ${data}">${data}</span>`;
    }
  }
];

  const fetchLogs = async (filters = null, append = false) => {
    setLoading(true);
    if (!append) {
      setLogs([]); // Clear previous logs
      _setProgress('0%'); // Reset progress
      setTotalCount(0); // Reset total count
      setHasLoadedData(false); // Reset loaded state
    }

    let lastId = append && logs.length ? logs[logs.length - 1]._id : null;
    const limit = 500;
    try {
      console.log('Fetching logs with params:', filters);
      do {
        const data = await MetricsService.getChatLogs(filters, limit, lastId);
        console.log('API response:', data);
        if (data.success) {
          const logsData = data.logs || [];
          setLogs((prevLogs) => append ? [...prevLogs, ...logsData] : [...prevLogs, ...logsData]);
          _setProgress(data.progress || '0%');
          setTotalCount(data.totalCount || 0);
          lastId = data.lastId; // Update lastId for the next iteration
        } else {
          throw new Error(data.error || 'Failed to fetch logs');
        }
      } while (lastId);
      setHasLoadedData(true); // Only show download interface after all chunks are loaded
    } catch (error) {
      console.error('Error fetching logs:', error);
      alert(`Failed to fetch logs: ${error.message}`);
    }
    setLoading(false);
  };

  const handleGetLogs = () => {
    // Only show filter panel, do not query
    setShowFilterPanel(true);
  };

  const handleApplyFilters = (filters) => {
    fetchLogs(filters, false); // Start fetching logs
  };

  const handleClearFilters = () => {
    const today = new Date();
    const todayFilters = {
      startDate: today,
      endDate: today
    };
    fetchLogs(todayFilters);
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem(FILTER_PANEL_STORAGE_KEY);
      }
    } catch (err) {
      // ignore
    }
  };

  const filename = (ext) => {
    let name = 'chat-logs-' + new Date().toISOString();
    return name + '.' + ext;
  };

  const downloadJSON = () => {
    // Always export the currently filtered logs
    const json = JSON.stringify(logs, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename('json');
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadCSV = () => {
    ExportService.export(logs, filename('csv'));
  };

  const downloadExcel = () => {
    ExportService.export(logs, filename('xlsx'));
  };

return (
  <div className="space-y-6">
    {loading && (
      <div className="loading-indicator">
        Loading logs: {totalCount} records left to load
      </div>
    )}
    {!hasLoadedData && (
      <div className="bg-white shadow rounded-lg p-4">
        <GcdsButton
          onClick={handleGetLogs}
          disabled={loading}
          className="me-400 hydrated"
        >
          {loading ? t('admin.chatLogs.loading') : t('admin.chatLogs.getLogs')}
        </GcdsButton>
      </div>
    )}

    {showFilterPanel && (
      <FilterPanel
        onApplyFilters={handleApplyFilters}
        onClearFilters={handleClearFilters}
        isVisible={true}
        storageKey={FILTER_PANEL_STORAGE_KEY}
      />
    )}

    {logs.length > 0 && hasLoadedData && (
      <>
        <div className="flex items-center gap-4 flex-wrap">
          <div className="mrgn-tp-1r">
            {t('admin.chatLogs.found')} {logs.length} {t('admin.chatLogs.interactionsFound')}
          </div>
          <GcdsButton
            onClick={downloadJSON}
            disabled={loading}
            className="me-400 hydrated mrgn-tp-1r"
          >
            {t('admin.chatLogs.downloadJson')}
          </GcdsButton>

          <GcdsButton
            onClick={downloadCSV}
            disabled={loading}
            className="me-400 hydrated mrgn-tp-1r"
          >
            {t('admin.chatLogs.downloadCsv')}
          </GcdsButton>
          <GcdsButton
            onClick={downloadExcel}
            disabled={loading}
            className="me-400 hydrated mrgn-tp-1r"
          >
            {t('admin.chatLogs.downloadExcel')}
          </GcdsButton>
        </div>
        
        <div className="chat-logs-table-container">
          <DataTable
            data={logs}
            columns={columns}
            className="display chat-logs-table"
            options={{
              paging: true,
              searching: true,
              ordering: true,
              order: [[5, 'desc']],
              scrollX: true
            }}
          />
        </div>
      </>
    )}
  </div>
);
};

export default ChatLogsDashboard;
