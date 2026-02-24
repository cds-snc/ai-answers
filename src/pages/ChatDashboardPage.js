import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GcdsContainer, GcdsText, GcdsLink } from '@cdssnc/gcds-components-react';
import DataTable from 'datatables.net-react';
import DT from 'datatables.net-dt';
import { useTranslations } from '../hooks/useTranslations.js';
import FilterPanel from '../components/admin/FilterPanel.js';
import DashboardService from '../services/DashboardService.js';
import '../styles/App.css';

DataTable.use(DT);

const escapeHtmlAttribute = (value) => {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
};

const formatDateForApi = (value) => {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  const pad = (num) => String(num).padStart(2, '0');
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  const seconds = pad(date.getSeconds());
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
};

const getTimezoneOffsetMinutes = (value) => {
  const date = value ? new Date(value) : new Date();
  const offset = date.getTimezoneOffset();
  return Number.isFinite(offset) ? offset : undefined;
};

const TABLE_STORAGE_KEY = `chatDashboard_tableState_v1_`;

const ChatDashboardPage = ({ lang = 'en' }) => {
  const { t } = useTranslations(lang);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [tableKey, setTableKey] = useState(0);
  const [dataTableReady, setDataTableReady] = useState(false);
  const [recordsTotal, setRecordsTotal] = useState(0);
  const [recordsFiltered, setRecordsFiltered] = useState(0);
  const [hasAppliedFilters, setHasAppliedFilters] = useState(false);

  const tableApiRef = useRef(null);
  const filtersRef = useRef({});

  const LOCAL_TABLE_STORAGE_KEY = `${TABLE_STORAGE_KEY}${lang}`;

  const numberFormatter = useMemo(
    () => new Intl.NumberFormat(lang === 'fr' ? 'fr-CA' : 'en-CA'),
    [lang]
  );

  // Helper function to truncate URL to path only (max 3 segments)
  const truncateUrl = useCallback((url) => {
    if (!url) return '';
    try {
      const urlObj = new URL(url);
      const pathParts = urlObj.pathname.split('/').filter(part => part !== '');

      // If no path segments or only 1 segment, show the domain
      if (pathParts.length <= 1) {
        const domain = urlObj.hostname.replace(/^www\./, '');
        return pathParts.length === 1 ? `${domain}/${pathParts[0]}` : domain;
      }

      // Keep only the last 3 path segments for longer URLs
      const truncatedParts = pathParts.slice(-3);
      return '/' + truncatedParts.join('/');
    } catch {
      return url;
    }
  }, []);

  // Helper function to format date as YYYY/MM/DD (date only)
  const formatDate = useCallback((dateStr) => {
    if (!dateStr) return '';
    try {
      const date = new Date(dateStr);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}/${month}/${day}`;
    } catch (err) {
      console.error('Failed to format date', err);
      return dateStr;
    }
  }, []);

  // Map DataTables column index to API orderBy fields
  const orderByForColumn = useCallback((colIdx) => {
    switch (colIdx) {
      case 0: return 'chatId';
      case 1: return 'interactionCount';
      case 2: return 'department';
      case 3: return 'createdAt';
      case 4: return 'userType';
      case 5: return 'pageLanguage';
      case 7: return 'referringUrl';
      case 8: return 'answerType';
      case 9: return 'partnerEval';
      case 10: return 'aiEval';
      default: return 'createdAt';
    }
  }, []);

  useEffect(() => {
    setTimeout(() => setDataTableReady(true), 0);
  }, []);

  const handleApplyFilters = useCallback((filters) => {
    const enrichedFilters = { ...(filters || {}) };
    const tzOffset = getTimezoneOffsetMinutes(enrichedFilters.startDate || enrichedFilters.endDate);
    if (tzOffset !== undefined) {
      enrichedFilters.timezoneOffsetMinutes = tzOffset;
    }
    filtersRef.current = enrichedFilters;
    setHasAppliedFilters(true);
    try {
      if (tableApiRef.current) {
        tableApiRef.current.ajax.reload();
      } else {
        setTableKey((prev) => prev + 1);
      }
    } catch (e) {
      // ignore
    }
  }, []);

  const handleClearFilters = useCallback((filtersFromPanel) => {
    // Clear saved table state
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        try { window.localStorage.removeItem(LOCAL_TABLE_STORAGE_KEY); } catch (e) { void e; }
        try { window.localStorage.removeItem(TABLE_STORAGE_KEY); } catch (e) { void e; }
      }
    } catch (e) {
      void e;
    }
    setTableKey((prev) => prev + 1);
    if (filtersFromPanel) {
      const enrichedFilters = { ...filtersFromPanel };
      const tzOffset = getTimezoneOffsetMinutes(enrichedFilters.startDate || enrichedFilters.endDate);
      if (tzOffset !== undefined) {
        enrichedFilters.timezoneOffsetMinutes = tzOffset;
      }
      filtersRef.current = enrichedFilters;
    }
    try {
      if (tableApiRef.current) tableApiRef.current.ajax.reload();
    } catch (e) { void e; }
  }, [LOCAL_TABLE_STORAGE_KEY]);

  const resultsSummary = useMemo(() => {
    const template = t('admin.chatDashboard.resultsSummary', 'Total matching chats: {count}');
    return template.replace('{count}', numberFormatter.format(recordsFiltered));
  }, [numberFormatter, recordsFiltered, t]);

  const totalSummary = useMemo(() => {
    const template = t('admin.chatDashboard.totalCount', 'Total chats in range: {total}');
    return template.replace('{total}', numberFormatter.format(recordsTotal));
  }, [numberFormatter, recordsTotal, t]);

  const columns = useMemo(() => ([
    {
      title: t('admin.chatDashboard.columns.chatId', 'Chat ID'),
      data: 'chatId',
      render: (value, type, row) => {
        if (!value) return '';
        const safeId = escapeHtmlAttribute(value);
        const chatLang = row.pageLanguage && (row.pageLanguage.toLowerCase().includes('fr')) ? 'fr' : 'en';
        return `<a href="/${chatLang}?chat=${safeId}&review=1" target="_blank" rel="noopener noreferrer">${safeId}</a>`;
      }
    },
    {
      title: t('admin.chatDashboard.columns.interactionCount', 'Length'),
      data: 'interactionCount',
      render: (value) => {
        return value != null ? String(value) : '0';
      }
    },
    {
      title: t('admin.chatDashboard.columns.department', 'Department'),
      data: 'department',
      render: (value, type, row) => {
        const primary = escapeHtmlAttribute(value || '');
        const allDepts = row.allDepartments || [];
        const otherCount = allDepts.length > 1 ? allDepts.length - 1 : 0;

        if (otherCount > 0) {
          const moreText = t('admin.chatDashboard.departmentMore', '+{count} more').replace('{count}', otherCount);
          const allDeptsStr = escapeHtmlAttribute(allDepts.join(', '));
          return `<span title="${allDeptsStr}" style="cursor: help; border-bottom: 1px dotted #999;">${primary} <span style="color: #666; font-size: 0.85em;">(${escapeHtmlAttribute(moreText)})</span></span>`;
        }
        return primary;
      }
    },
    {
      title: t('admin.chatDashboard.columns.date', 'Date'),
      data: 'date',
      render: (value) => formatDate(value)
    },
    {
      title: t('admin.chatDashboard.columns.userType', 'User Type'),
      data: 'userType',
      render: (value) => {
        const type = value || 'public';
        const label = t(`admin.chatDashboard.labels.userType.${type}`, type);
        return `<span class="label ${escapeHtmlAttribute(type)}">${escapeHtmlAttribute(label)}</span>`;
      }
    },
    {
      title: t('admin.chatDashboard.columns.pageLanguage', 'Page'),
      data: 'pageLanguage',
      render: (value) => {
        if (!value) return '';
        const normalized = value.toLowerCase().includes('fr') ? 'FR' : 'EN';
        return escapeHtmlAttribute(normalized);
      }
    },
    {
      title: t('admin.chatDashboard.columns.question', 'Question 1'),
      data: 'redactedQuestion',
      searchable: true,
      orderable: false,
      render: (value) => {
        if (!value) return '';
        const safe = escapeHtmlAttribute(value);
        if (value.length > 80) {
          const truncated = escapeHtmlAttribute(value.substring(0, 80));
          return `<span title="${safe}">${truncated}…</span>`;
        }
        return safe;
      }
    },
    {
      title: t('admin.chatDashboard.columns.referringUrl', 'Referring URL'),
      data: 'referringUrl',
      render: (value) => {
        if (!value) return '<span style="font-style: italic; color: #666;">none</span>';
        return escapeHtmlAttribute(truncateUrl(value));
      }
    },
    {
      title: t('admin.chatDashboard.columns.answerType', 'Answer Type'),
      data: 'answerType',
      render: (value) => {
        const type = value || 'normal';
        const label = t(`admin.chatDashboard.labels.answerType.${type}`, type);
        return `<span class="label ${escapeHtmlAttribute(type)}">${escapeHtmlAttribute(label)}</span>`;
      }
    },
    {
      title: t('admin.chatDashboard.columns.partnerEval', 'Partner Eval'),
      data: 'partnerEval',
      render: (value) => {
        if (!value) return '';
        const label = t(`admin.chatDashboard.labels.evaluation.${value}`, value);
        return `<span class="label ${escapeHtmlAttribute(value)}">${escapeHtmlAttribute(label)}</span>`;
      }
    },
    {
      title: t('admin.chatDashboard.columns.aiEval', 'AI Eval'),
      data: 'aiEval',
      render: (value) => {
        if (!value) return '';
        const label = t(`admin.chatDashboard.labels.evaluation.${value}`, value);
        return `<span class="label ${escapeHtmlAttribute(value)}">${escapeHtmlAttribute(label)}</span>`;
      }
    }
  ]), [formatDate, truncateUrl, t]);

  return (
    <GcdsContainer size="xl" mainContainer centered tag="main" className="mb-600">
      <h1 className="mb-400">{t('admin.chatDashboard.title', 'Chat dashboard')}</h1>

      <nav className="mb-400" aria-label={t('admin.navigation.ariaLabel', 'Admin Navigation')}>
        <GcdsText>
          <GcdsLink href={`/${lang}/admin`}>
            {t('common.backToAdmin', 'Back to Admin')}
          </GcdsLink>
        </GcdsText>
      </nav>

      <p className="mb-0 small-text">
        {t('admin.chatDashboard.description', 'Filter chat interactions and explore details in the table below.')}
      </p>

      <FilterPanel
        lang={lang}
        onApplyFilters={(filters) => { handleApplyFilters(filters); }}
        onClearFilters={handleClearFilters}
        isVisible={true}
      />

      {loading && (
        <div className="loading-overlay" role="status" aria-live="polite">
          <div className="loading-overlay-content">
            <div className="loading-animation" aria-hidden="true"></div>
            <span>{t('admin.chatDashboard.loading', 'Loading chats...')}</span>
          </div>
        </div>
      )}

      {error && (
        <div className="mt-400 error" role="alert">
          {t('admin.chatDashboard.error', 'Unable to load chat data.')} {String(error)}
        </div>
      )}

      {!loading && !error && recordsFiltered === 0 && recordsTotal === 0 && (
        <p className="chat-dashboard-no-results">
          {t('admin.chatDashboard.noResults', 'Apply filters to load chat interactions.')}
        </p>
      )}

      {hasAppliedFilters && (
        <div className="mt-200">
          <div className="chat-dashboard-summary" role="status" aria-live="polite">
            <output>{resultsSummary}</output>
            <output>{totalSummary}</output>
          </div>
          {dataTableReady && (
            <div className="chat-dashboard-table-container">
              <DataTable
                key={tableKey}
                columns={columns}
                className="display chat-dashboard-table"
                options={{
                  processing: true,
                  serverSide: true,
                  paging: true,
                  searching: true,
                  ordering: true,
                  order: [[3, 'desc']], // default to date desc
                  scrollX: true,
                  stateSave: true,
                  language: {
                    search: t('admin.chatDashboard.searchLabel', 'Search by Chat ID:'),
                    searchPlaceholder: t('admin.chatDashboard.searchPlaceholder', 'Enter chat ID...')
                  },
                  stateSaveCallback: function (settings, data) {
                    try {
                      if (typeof window !== 'undefined' && window.localStorage) {
                        window.localStorage.setItem(LOCAL_TABLE_STORAGE_KEY, JSON.stringify(data));
                        console.debug && console.debug('ChatDashboard: saved table state', LOCAL_TABLE_STORAGE_KEY, data);
                      }
                    } catch (e) {
                      // ignore
                    }
                  },
                  stateLoadCallback: function () {
                    try {
                      if (typeof window !== 'undefined' && window.localStorage) {
                        const stored = window.localStorage.getItem(LOCAL_TABLE_STORAGE_KEY);
                        const parsed = stored ? JSON.parse(stored) : null;
                        console.debug && console.debug('ChatDashboard: loaded table state', LOCAL_TABLE_STORAGE_KEY, parsed);
                        return parsed;
                      }
                    } catch (e) {
                      // ignore
                    }
                    return null;
                  },
                  ajax: async (dtParams, callback) => {
                    try {
                      setLoading(true);
                      setError(null);
                      const dtOrder = Array.isArray(dtParams.order) && dtParams.order.length > 0 ? dtParams.order[0] : { column: 3, dir: 'desc' };
                      const orderBy = orderByForColumn(dtOrder.column);
                      const orderDir = dtOrder.dir || 'desc';
                      const searchValue = (dtParams.search && dtParams.search.value) || '';
                      const currentFilters = filtersRef.current || {};

                      const normalizedFilters = { ...currentFilters };
                      const normalizedStart = formatDateForApi(currentFilters.startDate);
                      const normalizedEnd = formatDateForApi(currentFilters.endDate);
                      if (normalizedStart) normalizedFilters.startDate = normalizedStart;
                      if (normalizedEnd) normalizedFilters.endDate = normalizedEnd;
                      const tzOffset = getTimezoneOffsetMinutes(currentFilters.startDate || currentFilters.endDate);
                      if (tzOffset !== undefined) normalizedFilters.timezoneOffsetMinutes = tzOffset;

                      const query = {
                        ...normalizedFilters,
                        start: dtParams.start || 0,
                        length: dtParams.length || 10,
                        orderBy,
                        orderDir,
                        draw: dtParams.draw || 0
                      };
                      if (searchValue) {
                        query.search = searchValue;
                      }
                      const result = await DashboardService.getChatDashboard(query);
                      setRecordsTotal(result?.recordsTotal || 0);
                      setRecordsFiltered(result?.recordsFiltered || 0);
                      callback({
                        draw: dtParams.draw || 0,
                        recordsTotal: result?.recordsTotal || 0,
                        recordsFiltered: result?.recordsFiltered || 0,
                        data: Array.isArray(result?.data) ? result.data : []
                      });
                    } catch (err) {
                      console.error('Failed to load chat dashboard data', err);
                      setError(err.message || String(err));
                      callback({ draw: dtParams.draw || 0, recordsTotal: 0, recordsFiltered: 0, data: [] });
                    } finally {
                      setLoading(false);
                    }
                  },
                  initComplete: function () {
                    try {
                      const api = this.api();
                      tableApiRef.current = api;
                      console.debug && console.debug('ChatDashboard: DataTable initComplete');
                      api.on('xhr.dt', function (_e, _settings, json) {
                        try {
                          setRecordsTotal((json && json.recordsTotal) || 0);
                          setRecordsFiltered((json && json.recordsFiltered) || 0);
                        } catch (e) { /* ignore */ }
                      });
                    } catch (e) { /* ignore */ }
                  }
                }}
              />
            </div>
          )}
        </div>
      )}
    </GcdsContainer>
  );
};

export default ChatDashboardPage;