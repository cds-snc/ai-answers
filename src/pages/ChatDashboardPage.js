import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GcdsContainer, GcdsText, GcdsLink } from '@gcds-core/components-react';
import DataTable from 'datatables.net-react';
import DT from 'datatables.net-dt';
import { useTranslations } from '../hooks/useTranslations.js';
import { dataTableLanguage } from '../utils/dataTableLanguage.js';
import FilterPanel from '../components/admin/FilterPanel.js';
import DashboardService from '../services/DashboardService.js';
import StatusMessage from '../components/admin/StatusMessage.js';
import LoadingOverlay from '../components/admin/LoadingOverlay.js';
import { escapeHtmlAttribute, buildChatReviewLinkHtml } from '../utils/reviewLink.js';
import { normalizeAnswerText } from '../utils/answerText.js';

DataTable.use(DT);

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

const TABLE_STORAGE_KEY = `chatDashboard_tableState_v2_`;

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

  // Question/Answer cell text: strip pipeline-added sentence markers
  // (<s-1>...</s-1>, added for per-sentence citation/scoring) so they never
  // show up as literal text, and render the full content - no truncation.
  const renderAnswerText = useCallback((value) => {
    if (!value) return '';
    return escapeHtmlAttribute(normalizeAnswerText(value));
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
    setLoading(true);
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
    const template = t('admin.chatDashboard.resultsSummary', 'Showing {count} questions');
    return template.replace('{count}', numberFormatter.format(recordsFiltered));
  }, [numberFormatter, recordsFiltered, t]);

  const totalSummary = useMemo(() => {
    const template = t('admin.chatDashboard.totalCount', 'Total matching questions: {total}');
    return template.replace('{total}', numberFormatter.format(recordsTotal));
  }, [numberFormatter, recordsTotal, t]);

  const columns = useMemo(() => ([
    {
      title: t('admin.chatDashboard.columns.chatId', 'Chat ID'),
      data: 'chatId',
      searchable: false,
      orderable: true,
      render: (value, type, row) => {
        if (!value) return '';
        const chatLang = row.pageLanguage && (row.pageLanguage.toLowerCase().includes('fr')) ? 'fr' : 'en';
        return buildChatReviewLinkHtml(value, chatLang, row.interactionId);
      }
    },
    {
      title: t('admin.chatDashboard.columns.department', 'Department'),
      data: 'department',
      searchable: false,
      orderable: true,
      render: (value) => escapeHtmlAttribute(value || '')
    },
    {
      title: t('admin.chatDashboard.columns.program', 'Service'),
      data: 'program',
      searchable: true,
      orderable: true,
      render: (value, type, row) => {
        const display = (lang === 'fr' && row && row.programFr) ? row.programFr : value;
        return display ? escapeHtmlAttribute(display) : '';
      }
    },
    {
      title: t('admin.chatDashboard.columns.question', 'Question'),
      data: 'redactedQuestion',
      searchable: false,
      orderable: false,
      render: (value) => renderAnswerText(value)
    },
    {
      title: t('admin.chatDashboard.columns.answer', 'Answer'),
      data: 'answerContent',
      searchable: false,
      orderable: false,
      render: (value) => renderAnswerText(value)
    },
    {
      title: t('admin.chatDashboard.columns.citationUrl', 'Citation link'),
      data: 'citationUrl',
      searchable: false,
      orderable: false,
      render: (value) => {
        if (!value) return '';
        return escapeHtmlAttribute(truncateUrl(value));
      }
    }
  ]), [renderAnswerText, truncateUrl, t, lang]);

  return (
    <GcdsContainer layout="page" className="mb-600">
      <h1 className="mb-400">{t('admin.chatDashboard.title', 'Chat dashboard')}</h1>

      <nav className="mb-400" aria-label={t('admin.navigation.ariaLabel', 'Admin Navigation')}>
        <GcdsText>
          <GcdsLink href={`/${lang}/admin`}>
            {t('common.backToAdmin')}
          </GcdsLink>
        </GcdsText>
      </nav>

      <h2 className="mt-400 mb-400">{t('admin.chatDashboard.timeRangeTitle')}</h2>
      <div className="mb-100">
        <FilterPanel
          lang={lang}
          onApplyFilters={(filters) => { handleApplyFilters(filters); }}
          onClearFilters={handleClearFilters}
          isVisible={true}
          filterLoading={loading}
          filterError={error}
          filterResultCount={recordsTotal}
          hasAppliedFilters={hasAppliedFilters}
        />
      </div>

      {loading && (
        <LoadingOverlay message={t('admin.chatDashboard.loading')} />
      )}

      <StatusMessage
        variant={error ? 'error' : undefined}
        message={error ? `${t('admin.chatDashboard.error')} ${String(error)}` : null}
      />

      {hasAppliedFilters && !loading && !error && recordsTotal === 0 && (
        <StatusMessage variant="info" message={t('common.noDataForFilters')} />
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
                  order: [],
                  // autoWidth (DataTables' default true) + scrollX together
                  // pin each column to a fixed pixel width computed from a
                  // separate header/body table pair - when a column's cell
                  // content varies a lot in width across rows/redraws (e.g.
                  // Question/Answer/Citation link, often empty), that pair
                  // falls out of sync and the header drifts away from its
                  // column's data. EvalDashboardPage.js already avoids this
                  // (autoWidth: false, no scrollX) - matching that here.
                  autoWidth: false,
                  stateSave: true,
                  language: {
                    ...dataTableLanguage(lang),
                    search: t('admin.chatDashboard.searchLabel', 'Search by Chat ID:'),
                    searchPlaceholder: t('admin.chatDashboard.searchPlaceholder', 'Enter chat ID...')
                  },
                  stateSaveCallback: function (settings, data) {
                    try {
                      if (typeof window !== 'undefined' && window.localStorage) {
                        window.localStorage.setItem(LOCAL_TABLE_STORAGE_KEY, JSON.stringify(data));
                      }
                    } catch (e) {
                      // ignore
                    }
                  },
                  stateLoadCallback: function () {
                    try {
                      if (typeof window !== 'undefined' && window.localStorage) {
                        const stored = window.localStorage.getItem(LOCAL_TABLE_STORAGE_KEY);
                        return stored ? JSON.parse(stored) : null;
                      }
                    } catch (e) {
                      // ignore
                    }
                    return null;
                  },
                  // Add a per-column header input for the Service column,
                  // same mechanism EvalDashboardPage.js already uses for its
                  // program column - loop over every searchable column so a
                  // future searchable column picks this up automatically.
                  initComplete: function () {
                    try {
                      const api = this.api();
                      tableApiRef.current = api;
                      api.on('xhr.dt', function (_e, _settings, json) {
                        try {
                          setRecordsTotal((json && json.recordsTotal) || 0);
                          setRecordsFiltered((json && json.recordsFiltered) || 0);
                        } catch (e) { /* ignore */ }
                      });
                      const debounce = (fn, wait = 300) => {
                        let timer = null;
                        return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), wait); };
                      };
                      api.columns().every(function (idx) {
                        const column = this;
                        const colInfo = column.settings()[0].aoColumns[idx] || {};
                        if (!colInfo.searchable) return;
                        const headerEl = column.header();
                        if (!headerEl) return;
                        const existingFilterContainer = headerEl.querySelector('.dt-col-filter-container');
                        if (existingFilterContainer) headerEl.removeChild(existingFilterContainer);
                        const colTitle = headerEl.textContent.trim();
                        const filterContainer = document.createElement('div');
                        filterContainer.className = 'dt-col-filter-container';
                        filterContainer.style.marginTop = '4px';
                        const input = document.createElement('input');
                        input.type = 'search';
                        input.className = 'dt-col-search';
                        input.placeholder = t('admin.chatDashboard.columnFilterPlaceholder', 'Filter');
                        input.setAttribute('aria-label', `${input.placeholder} — ${colTitle}`);
                        input.addEventListener('input', debounce(function (e) {
                          column.search(e.target.value);
                          api.page('first').draw('page');
                        }, 350));
                        filterContainer.appendChild(input);
                        const stopSort = (event) => event.stopPropagation();
                        filterContainer.addEventListener('click', stopSort);
                        filterContainer.addEventListener('mousedown', stopSort);
                        headerEl.appendChild(filterContainer);
                      });
                    } catch (e) { /* ignore initComplete errors */ }
                  },
                  ajax: async (dtParams, callback) => {
                    try {
                      setLoading(true);
                      setError(null);
                      // Derived from `columns` (in scope above) rather than hand-listed, so
                      // inserting/removing a column can't silently desync this mapping from
                      // the actual column positions (same fix already applied in
                      // EvalDashboardPage.js).
                      const orderByMap = columns.map((c) => c.data);
                      const dtOrder = Array.isArray(dtParams.order) && dtParams.order.length > 0 ? dtParams.order[0] : null;
                      const orderBy = dtOrder ? (orderByMap[dtOrder.column] || 'createdAt') : 'createdAt';
                      const orderDir = dtOrder ? (dtOrder.dir || 'desc') : 'desc';
                      const searchValue = (dtParams.search && dtParams.search.value) || '';
                      const columnSearches = {};
                      if (Array.isArray(dtParams.columns)) {
                        dtParams.columns.forEach((col) => {
                          const val = col && col.search && String(col.search.value || '').trim();
                          if (val) {
                            const colName = col.data || null;
                            if (colName) columnSearches[colName] = val;
                          }
                        });
                      }
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
                      if (Object.keys(columnSearches).length) {
                        query.columnSearch = columnSearches;
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
