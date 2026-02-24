import React, { useState } from 'react';
import { GcdsButton } from '@cdssnc/gcds-components-react';
import '../../styles/App.css';
import { useTranslations } from '../../hooks/useTranslations.js';
import FilterPanel from './FilterPanel.js';
import AuthService from '../../services/AuthService.js';
import { getApiUrl } from '../../utils/apiToUrl.js';



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
    // No-op since we no longer persist filter state
  };

  return (
    <div className="space-y-6">
      {exporting && (
        <div className="loading-overlay" role="status" aria-live="polite">
          <div className="loading-overlay-content">
            <div className="loading-animation" aria-hidden="true"></div>
            <span>{t('admin.chatLogs.exporting', 'Exporting...')} {t('admin.chatLogs.exportingMessage', 'Please wait while your file is being generated.')}</span>
          </div>
        </div>
      )}

      {!showPanel && (
        <div className="bg-white shadow rounded-lg p-4">
          <GcdsButton
            id="get-logs-button"
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
          <div className="export-controls bg-white shadow rounded-lg p-4 mb-600">
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
          </div>

          {/* Filter Panel - Apply triggers export */}
          <FilterPanel
            lang={lang}
            onApplyFilters={handleApplyFilters}
            onClearFilters={handleClearFilters}
            isVisible={true}
            applyButtonText={exporting ? (t('admin.chatLogs.exporting') || 'Exporting...') : (t('admin.chatLogs.export') || 'Export')}
            applyDisabled={exporting}
            autoApply={false}
          />
        </>
      )}
    </div>
  );
};

export default ChatLogsDashboard;
