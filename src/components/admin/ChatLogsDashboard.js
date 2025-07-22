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

  const fetchLogs = async (filters = null) => {
    setLoading(true);
    try {
      const apiParams = buildApiParams(filters || {});
      console.log('Fetching logs with params:', apiParams);
      const data = await DataStoreService.getChatLogs(apiParams);
      console.log('API response:', data);
      if (data.success) {
        const logsData = data.logs || [];
        setLogs(logsData);
        setHasLoadedData(true);

        
        console.log('Set logs:', logsData);
      } else {
        console.error('API returned error:', data.error);
        alert(data.error || 'Failed to fetch logs');
        
      }
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
    fetchLogs(filters);
  };

  const handleClearFilters = () => {
    const today = new Date();
    const todayFilters = {
      dateRange: {
        startDate: today,
        endDate: today
      }
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
