import React, { useState } from 'react';
import { GcdsButton } from '@cdssnc/gcds-components-react';
import '../../styles/App.css';
import DataStoreService from '../../services/DataStoreService.js';
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
  const [pagination, setPagination] = useState({
    total: 0,
    limit: 50,
    offset: 0,
    hasMore: false
  });
  const [currentFilters, setCurrentFilters] = useState(null);

  // Convert new filter format to API parameters
  const buildApiParams = (filters) => {
    const params = {};
    
    if (filters && filters.dateRange) {
      if (filters.dateRange.startDate && filters.dateRange.endDate) {
        // Handle both Date objects and datetime strings
        const startDate = filters.dateRange.startDate instanceof Date 
          ? filters.dateRange.startDate.toISOString() 
          : filters.dateRange.startDate;
        const endDate = filters.dateRange.endDate instanceof Date 
          ? filters.dateRange.endDate.toISOString() 
          : filters.dateRange.endDate;
        
        params.startDate = startDate;
        params.endDate = endDate;
      }
    }
    
    // Add preset filter information
    if (filters && filters.filterType) {
      params.filterType = filters.filterType;
    }
    
    if (filters && filters.presetValue) {
      params.presetValue = filters.presetValue;
    }
    
    // Add future filter parameters
    if (filters && filters.referringUrl) {
      params.referringUrl = filters.referringUrl;
    }
    
    if (filters && filters.department) {
      params.department = filters.department;
    }
    
    return params;
  };

  const fetchLogs = async (filters = null, pageOffset = 0) => {
    setLoading(true);
    try {
      const apiParams = buildApiParams(filters || {});
      
      // Add pagination parameters
      apiParams.limit = pagination.limit;
      apiParams.offset = pageOffset;
      
      console.log('Fetching logs with params:', apiParams);
      const data = await DataStoreService.getChatLogs(apiParams);
      console.log('API response:', data);
      if (data.success) {
        const logsData = data.logs || [];
        setLogs(logsData);
        setHasLoadedData(true);
        
        // Update pagination info
        if (data.pagination) {
          setPagination({
            total: data.pagination.total,
            limit: data.pagination.limit,
            offset: data.pagination.offset,
            hasMore: data.pagination.hasMore
          });
        }
        
        // Only show filter panel if we have data or if this is a subsequent filter request
        if (logsData.length > 0 || filters) {
          setShowFilterPanel(true);
        }
        console.log('Set logs:', logsData);
      } else {
        console.error('API returned error:', data.error);
        alert(data.error || 'Failed to fetch logs');
        // Don't show filter panel on error
        setShowFilterPanel(false);
      }
    } catch (error) {
      console.error('Error fetching logs:', error);
      alert(`Failed to fetch logs: ${error.message}`);
      // Don't show filter panel on error
      setShowFilterPanel(false);
    }
    setLoading(false);
  };

  const handleGetLogs = () => {
    // Default to today's data instead of all data for faster loading
    const today = new Date();
    const todayFilters = {
      dateRange: {
        startDate: today,
        endDate: today
      }
    };
    fetchLogs(todayFilters, 0);
  };

  const handleApplyFilters = (filters) => {
    setCurrentFilters(filters);
    fetchLogs(filters, 0);
  };

  const handleClearFilters = () => {
    const today = new Date();
    const todayFilters = {
      dateRange: {
        startDate: today,
        endDate: today
      }
    };
    fetchLogs(todayFilters, 0);
  };

  const filename = (ext) => {
    let name = 'chat-logs-' + new Date().toISOString();
    return name + '.' + ext;
  };

  const downloadJSON = async () => {
    try {
      // Use the current filters that were last applied to the UI
      const apiParams = buildApiParams(currentFilters || {});
      apiParams.export = 'true';
      
      const data = await DataStoreService.getChatLogs(apiParams);
      if (data.success) {
        const json = JSON.stringify(data.logs, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename('json');
        a.click();
        URL.revokeObjectURL(url);
      } else {
        alert('Failed to export data');
      }
    } catch (error) {
      console.error('Error downloading JSON:', error);
      alert('Failed to download JSON file');
    }
  };

  const downloadCSV = async () => {
    try {
      // Use the current filters that were last applied to the UI
      const apiParams = buildApiParams(currentFilters || {});
      apiParams.export = 'true';
      
      const data = await DataStoreService.getChatLogs(apiParams);
      if (data.success) {
        ExportService.export(data.logs, filename('csv'));
      } else {
        alert('Failed to export data');
      }
    } catch (error) {
      console.error('Error downloading CSV:', error);
      alert('Failed to download CSV file');
    }
  };

  const downloadExcel = async () => {
    try {
      // Use the current filters that were last applied to the UI
      const apiParams = buildApiParams(currentFilters || {});
      apiParams.export = 'true';
      
      const data = await DataStoreService.getChatLogs(apiParams);
      if (data.success) {
        ExportService.export(data.logs, filename('xlsx'));
      } else {
        alert('Failed to export data');
      }
    } catch (error) {
      console.error('Error downloading Excel:', error);
      alert('Failed to download Excel file');
    }
  };

  return (
    <div className="space-y-6">
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

      {logs.length > 0 && (
        <div className="flex items-center gap-4 flex-wrap">
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

      <div className="bg-white shadow rounded-lg">
        {loading ? (
          <div className="p-4">
            <p className="text-gray-500">{t('admin.chatLogs.loadingLogs')}</p>
          </div>
        ) : logs.length > 0 ? (
          <div className="p-4">
            <p className="mb-4 text-gray-600">
              {t('admin.chatLogs.found')} {pagination.total} {t('admin.chatLogs.interactionsFound')} 
              {pagination.total > pagination.limit && ` (showing ${logs.length} of ${pagination.total})`}
            </p>
            <DataTable
              data={logs}
              columns={[
                { title: t('admin.chatLogs.date'), data: 'createdAt', render: (data) => (data ? data : '') },
                { title: t('admin.chatLogs.chatId'), data: 'chatId', render: (data) => (data ? data : '') },
                {
                  title: t('admin.chatLogs.interactions'),
                  data: 'interactions',
                  render: (data) => (data ? data.length : 0),
                },
              ]}
              options={{
                paging: true,
                searching: true,
                ordering: true,
                order: [[0, 'desc']],
                pageLength: pagination.limit,
                info: true,
                lengthChange: true,
                lengthMenu: [[25, 50, 100, -1], [25, 50, 100, 'All']]
              }}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default ChatLogsDashboard;
