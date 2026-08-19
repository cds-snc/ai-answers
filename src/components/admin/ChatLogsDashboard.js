import React, { useState, useMemo, useRef, useEffect } from 'react';
import { GcdsButton } from '@gcds-core/components-react';
import { useTranslations } from '../../hooks/useTranslations.js';
import FilterPanel from './FilterPanel.js';
import AuthService from '../../services/AuthService.js';
import { getApiUrl } from '../../utils/apiToUrl.js';
import StatusMessage from './StatusMessage.js';



const ChatLogsDashboard = ({ lang = 'en' }) => {
  const { t } = useTranslations(lang);

  const VIEW_OPTIONS = useMemo(() => [
    { value: 'default', label: t('admin.chatLogs.views.default') },
    { value: 'tools', label: t('admin.chatLogs.views.tools') },
    { value: 'auto-eval-debug', label: t('admin.chatLogs.views.autoEvalDebug') },
  ], [t]);

  const FORMAT_OPTIONS = useMemo(() => [
    { value: 'xlsx', label: t('admin.chatLogs.formats.xlsx') },
    { value: 'csv', label: t('admin.chatLogs.formats.csv') },
    { value: 'json', label: t('admin.chatLogs.formats.json') },
  ], [t]);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState(null);
  const [showPanel, setShowPanel] = useState(false);

  // Export options
  const [selectedView, setSelectedView] = useState('default');
  const [selectedFormat, setSelectedFormat] = useState('xlsx');

  // "Get logs" removes itself from the DOM the moment it's clicked, so move
  // focus to the first control in the panel that replaces it — otherwise
  // keyboard/screen-reader focus silently drops to <body>.
  const exportViewRef = useRef(null);
  useEffect(() => {
    if (showPanel) exportViewRef.current?.focus();
  }, [showPanel]);

  const handleGetLogs = () => {
    // Show the export options and filter panel
    setShowPanel(true);
  };

  const handleApplyFilters = async (filters) => {
    // When Apply is clicked, directly trigger the export
    setExporting(true);
    setExportError(null);
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
        if (filters.evalLogic) params.append('evalLogic', filters.evalLogic);
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
      // error.message is raw, untranslated exception text — same reasoning
      // as DeleteChatSection.js's fix: split the translated template around
      // the placeholder and wrap just the detail in lang="en" rather than
      // running it through .replace() as a plain string substitution.
      const [prefix, suffix] = t('admin.chatLogs.exportError').split('{error}');
      setExportError({ prefix, suffix, detail: error.message || String(error) });
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
            <span>{t('admin.chatLogs.exporting')} {t('admin.chatLogs.exportingMessage')}</span>
          </div>
        </div>
      )}

      {exportError && (
        <StatusMessage variant="error">
          {exportError.prefix}<span lang="en">{exportError.detail}</span>{exportError.suffix}
        </StatusMessage>
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
          {/* TODO (design): this export table's controls need a design pass:
              a custom calendar component for the date range (currently
              FilterPanel's default date inputs), resize/layout improvements
              for this section, and a clearly visible dedicated Export
              button (the export is currently triggered via FilterPanel's
              generic "Apply" button below, not an obviously-labelled export
              action of its own). */}
          <div className="export-controls bg-white shadow rounded-lg p-4 mb-600">
            <p className="mrgn-bttm-md">{t('admin.chatLogs.exportDescription')}</p>

            <div className="flex items-center gap-4 flex-wrap">
              {/* View Dropdown */}
              <div className="export-control-group">
                <label htmlFor="export-view" className="filter-label">
                  {t('admin.chatLogs.exportView')}
                </label>
                <select
                  id="export-view"
                  ref={exportViewRef}
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
                  {t('admin.chatLogs.exportFormat')}
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
            applyButtonText={exporting ? t('admin.chatLogs.exporting') : t('admin.chatLogs.export')}
            applyDisabled={exporting}
            autoApply={false}
          />
        </>
      )}
    </div>
  );
};

export default ChatLogsDashboard;
