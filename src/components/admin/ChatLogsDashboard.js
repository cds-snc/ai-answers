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

const ChatLogsDashboard = ({ lang = 'en' }) => {
  const { t } = useTranslations(lang);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [hasLoadedData, setHasLoadedData] = useState(false);
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [, _setProgress] = useState('0%');
  const [totalCount, setTotalCount] = useState(0);

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
        />
      )}

      {logs.length > 0 && hasLoadedData && (
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
      )}
    </div>
  );
};

export default ChatLogsDashboard;
