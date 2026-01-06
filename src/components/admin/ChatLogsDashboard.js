import React, { useState } from 'react';
import { GcdsButton } from '@cdssnc/gcds-components-react';
import '../../styles/App.css';
import { useTranslations } from '../../hooks/useTranslations.js';
import FilterPanel from './FilterPanel.js';
import AuthService from '../../services/AuthService.js';
import { getApiUrl } from '../../utils/apiToUrl.js';

const FILTER_PANEL_STORAGE_KEY = 'chatLogsFilterPanelState_v1';

// View options for export
const VIEW_OPTIONS = [
  { value: 'default', label: 'Default' },
  { value: 'tools', label: 'Tools' },
  { value: 'auto-eval-debug', label: 'Auto-eval Debug' }
];

// Format options for export
const FORMAT_OPTIONS = [
  { value: 'xlsx', label: 'Excel (.xlsx)' },
  { value: 'csv', label: 'CSV (.csv)' },
  { value: 'json', label: 'JSON (.json)' }
];

const ChatLogsDashboard = ({ lang = 'en' }) => {
  const { t } = useTranslations(lang);
  const [exporting, setExporting] = useState(false);
  const [showPanel, setShowPanel] = useState(false);

  // Export options
  const [selectedView, setSelectedView] = useState('default');
  const [selectedFormat, setSelectedFormat] = useState('xlsx');

  const handleGetLogs = () => {
    // Show the export options and filter panel
    setShowPanel(true);
  };

  const handleApplyFilters = async (filters) => {
    // When Apply is clicked, directly trigger the export
    setExporting(true);
    try {
      // Build query params from filters
      const params = new URLSearchParams();

      if (filters) {
        if (filters.startDate) params.append('startDate', filters.startDate);
        if (filters.endDate) params.append('endDate', filters.endDate);
        if (filters.department) params.append('department', filters.department);
        if (filters.urlEn) params.append('urlEn', filters.urlEn);
        if (filters.urlFr) params.append('urlFr', filters.urlFr);
        if (filters.userType && filters.userType !== 'all') {
          params.append('userType', filters.userType);
        }
        if (filters.answerType && filters.answerType !== 'all') {
          params.append('answerType', filters.answerType);
        }
        if (filters.partnerEval && filters.partnerEval !== 'all') {
          params.append('partnerEval', filters.partnerEval);
        }
        if (filters.aiEval && filters.aiEval !== 'all') {
          params.append('aiEval', filters.aiEval);
        }
      }

      params.append('view', selectedView);
      params.append('format', selectedFormat);

      const url = getApiUrl(`chat-export-logs?${params.toString()}`);

      // Use AuthService.fetch to include auth headers
      const response = await AuthService.fetch(url);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Export failed');
      }

      // Get filename from Content-Disposition header or generate one
      const contentDisposition = response.headers.get('Content-Disposition');
      let filename = `chat-logs-${selectedView}-${new Date().toISOString().split('T')[0]}.${selectedFormat}`;
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="?([^"]+)"?/);
        if (match) filename = match[1];
      }

      // Download the file
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(downloadUrl);
    } catch (error) {
      console.error('Export error:', error);
      alert(`Export failed: ${error.message}`);
    }
    setExporting(false);
  };

  const handleClearFilters = () => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem(FILTER_PANEL_STORAGE_KEY);
      }
    } catch (err) {
      // ignore
    }
  };

  return (
    <div className="space-y-6">
      {!showPanel && (
        <div className="bg-white shadow rounded-lg p-4">
          <GcdsButton
            onClick={handleGetLogs}
            className="me-400 hydrated"
          >
            {t('admin.chatLogs.getLogs')}
          </GcdsButton>
        </div>
      )}

      {showPanel && (
        <>
          {/* Export Options - Above Filter Panel */}
          <div className="export-controls bg-white shadow rounded-lg p-4 mb-10">
            <h3 className="mrgn-bttm-md">{t('admin.chatLogs.title')}</h3>
            <p className="mrgn-bttm-md">{t('admin.chatLogs.exportDescription') || 'Select export options, configure filters, then click Apply to download.'}</p>

            <div className="flex items-center gap-4 flex-wrap">
              {/* View Dropdown */}
              <div className="export-control-group">
                <label htmlFor="export-view" className="filter-label">
                  {t('admin.chatLogs.exportView') || 'Export View'}
                </label>
                <select
                  id="export-view"
                  value={selectedView}
                  onChange={(e) => setSelectedView(e.target.value)}
                  className="filter-select"
                  disabled={exporting}
                >
                  {VIEW_OPTIONS.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Format Dropdown */}
              <div className="export-control-group">
                <label htmlFor="export-format" className="filter-label">
                  {t('admin.chatLogs.exportFormat') || 'Format'}
                </label>
                <select
                  id="export-format"
                  value={selectedFormat}
                  onChange={(e) => setSelectedFormat(e.target.value)}
                  className="filter-select"
                  disabled={exporting}
                >
                  {FORMAT_OPTIONS.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {exporting && (
              <div className="mrgn-tp-md">
                <strong>{t('admin.chatLogs.exporting') || 'Exporting...'}</strong>
                <span className="mrgn-lft-sm">Please wait while your file is being generated.</span>
              </div>
            )}
          </div>

          {/* Filter Panel - Apply triggers export */}
          <FilterPanel
            onApplyFilters={handleApplyFilters}
            onClearFilters={handleClearFilters}
            isVisible={true}
            storageKey={FILTER_PANEL_STORAGE_KEY}
            applyButtonText={exporting ? (t('admin.chatLogs.exporting') || 'Exporting...') : (t('admin.chatLogs.export') || 'Export')}
            applyDisabled={exporting}
            skipAutoApply={true}
          />
        </>
      )}
    </div>
  );
};

export default ChatLogsDashboard;
