import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GcdsContainer, GcdsText, GcdsLink } from '@gcds-core/components-react';
import DataTable from 'datatables.net-react';
import DT from 'datatables.net-dt';
import { useTranslations } from '../hooks/useTranslations.js';
import { dataTableLanguage } from '../utils/dataTableLanguage.js';
import FilterPanel from '../components/admin/FilterPanel.js';
import EvaluationService from '../services/EvaluationService.js';
import StatusMessage from '../components/admin/StatusMessage.js';
import { escapeHtmlAttribute, buildChatReviewLinkHtml } from '../utils/reviewLink.js';

DataTable.use(DT);

const TABLE_STORAGE_KEY = `evalDashboard_tableState_v3_`;

const truncateEmail = (email) => {
  if (!email) return '';
  return email.split('@')[0];
};

const truncateUrl = (url) => {
  if (!url) return '';
  try {
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split('/').filter(part => part !== '');
    if (pathParts.length <= 1) {
      const domain = urlObj.hostname.replace(/^www\./, '');
      return pathParts.length === 1 ? `${domain}/${pathParts[0]}` : domain;
    }
    const truncatedParts = pathParts.slice(-3);
    return '/' + truncatedParts.join('/');
  } catch {
    return url;
  }
};

const getDefaultEvalFilters = () => {
  const now = new Date();
  const start = new Date(now);
  start.setDate(now.getDate() - 7);
  return {
    startDate: start.toISOString(),
    endDate: now.toISOString()
  };
};
const EvalDashboardPage = ({ lang = 'en' }) => {
  const { t } = useTranslations(lang);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [tableKey, setTableKey] = useState(0);
  const [dataTableReady, setDataTableReady] = useState(false);
  const [pageResultCount, setPageResultCount] = useState(0);
  const [hasAppliedFilters, setHasAppliedFilters] = useState(false);

  const tableApiRef = useRef(null);
  const filtersRef = useRef(getDefaultEvalFilters());

  const LOCAL_TABLE_STORAGE_KEY = `${TABLE_STORAGE_KEY}${lang}`;

  const formatDate = useCallback((dateStr) => {
    if (!dateStr) return '';
    try {
      const date = new Date(dateStr);
      return new Intl.DateTimeFormat(lang === 'fr' ? 'fr-CA' : 'en-CA', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }).format(date);
    } catch (err) {
      console.error('Failed to format date', err);
      return dateStr;
    }
  }, [lang]);

  useEffect(() => {
    // allow table render
    setTimeout(() => setDataTableReady(true), 0);
  }, []);

  const handleApplyFilters = useCallback((filters) => {
    const normalized = {
      ...getDefaultEvalFilters(),
      ...(filters || {})
    };
    filtersRef.current = normalized;
    setHasAppliedFilters(true);
    setLoading(true);
    try {
      if (tableApiRef.current) tableApiRef.current.ajax.reload(null, true);
      else setTableKey((prev) => prev + 1);
    } catch (e) { void e; }
  }, []);

  const handleClearFilters = useCallback(() => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        try { window.localStorage.removeItem(LOCAL_TABLE_STORAGE_KEY); } catch (e) { void e; }
      }
    } catch (e) { void e; }
    setTableKey((prev) => prev + 1);
    filtersRef.current = getDefaultEvalFilters();
    try { if (tableApiRef.current) tableApiRef.current.ajax.reload(null, true); } catch (e) { void e; }
  }, [LOCAL_TABLE_STORAGE_KEY]);

  const columns = useMemo(() => ([
    {
      title: t('admin.evalDashboard.columns.chatId', 'Chat ID'),
      data: 'chatId',
      render: (value, type, row) => {
        if (!value) return '';
        const chatLang = row.pageLanguage && (row.pageLanguage.toLowerCase().includes('fr')) ? 'fr' : 'en';
        return buildChatReviewLinkHtml(value, chatLang, row.interactionId || row._id);
      },
      searchable: false,
      orderable: true
    },
    {
      title: t('admin.evalDashboard.columns.questionNumber', 'Q #'),
      data: 'questionNumber',
      render: (value) => value != null ? String(value) : '',
      width: '40px',
      searchable: false,
      orderable: true
    },
    { title: t('admin.chatDashboard.columns.partnerEval', 'Partner Eval'), data: 'partnerEval', render: (v, type, row) => { let html = ''; if (v) { const label = t(`admin.chatDashboard.labels.evaluation.${v}`); html += `<span class="label ${escapeHtmlAttribute(v)}">${escapeHtmlAttribute(label.includes('.') ? v : label)}</span>`; } if (row && row.partnerHasContentIssue) { const contentIssueLabel = t('admin.chatDashboard.labels.contentIssue'); html += `<span class="label hasContentIssue">${escapeHtmlAttribute(contentIssueLabel)}</span>`; } return html; }, searchable: false, orderable: true },
    { title: t('admin.chatDashboard.columns.aiEval', 'AI Eval'), data: 'aiEval', render: v => { if (!v) return ''; const label = t(`admin.chatDashboard.labels.evaluation.${v}`); return `<span class="label ${escapeHtmlAttribute(v)}">${escapeHtmlAttribute(label.includes('.') ? v : label)}</span>`; }, searchable: false, orderable: true },
    {
      title: t('admin.evalDashboard.columns.feedback', 'Feedback'), data: 'feedback', render: v => {
        // Neutral grey, not correct/error — whether a user found an answer
        // helpful is subjective, not a clear pass/fail outcome like the
        // other pills in this table.
        if (v === 'yes') return `<span class="label normal">${escapeHtmlAttribute(t('reviewPanels.helpfulYes'))}</span>`;
        if (v === 'no') return `<span class="label normal">${escapeHtmlAttribute(t('reviewPanels.helpfulNo'))}</span>`;
        return v ? escapeHtmlAttribute(v) : '';
      }, searchable: false, orderable: true
    },
    {
      title: t('admin.evalDashboard.columns.download', 'Download'),
      data: 'hasDownload',
      // hasDownload: 'success' | 'partial' | 'fail' | '' (see api/eval/eval-dashboard.js)
      render: v => {
        // No GC DS check/half-circle icon, so FA + hidden text alternative
        if (v === 'success') {
          return `<span class="text-status--positive"><i class="fa-solid fa-check" style="font-size: 1.4em;" aria-hidden="true"></i><span class="wb-inv">${escapeHtmlAttribute(t('reviewPanels.downloadSuccess'))}</span></span>`;
        }
        if (v === 'partial') {
          return `<span class="text-status--warning"><i class="fa-solid fa-circle-half-stroke" style="font-size: 1.4em;" aria-hidden="true"></i><span class="wb-inv">${escapeHtmlAttribute(t('reviewPanels.downloadPartial'))}</span></span>`;
        }
        return '';
      },
      width: '50px', searchable: false, orderable: true
    },
    { title: t('admin.evalDashboard.columns.department', 'Department'), data: 'department', searchable: false, orderable: true },
    { title: t('admin.evalDashboard.columns.program', 'Program'), data: 'program', render: (v, type, row) => { const d = (lang === 'fr' && row && row.programFr) ? row.programFr : v; return d ? escapeHtmlAttribute(d) : ''; }, searchable: true, orderable: true },
    { title: t('admin.evalDashboard.columns.action', 'Action'), data: 'action', render: (v, type, row) => { const d = (lang === 'fr' && row && row.actionFr) ? row.actionFr : v; return d ? escapeHtmlAttribute(d) : ''; }, searchable: true, orderable: true },
    { title: t('admin.chatDashboard.columns.referringUrl', 'Referring URL'), data: 'referringUrl', render: v => v ? escapeHtmlAttribute(truncateUrl(v)) : '<span style="color: #666;">none</span>', searchable: false, orderable: true },
    { title: t('admin.evalDashboard.columns.pageLanguage', 'Page'), data: 'pageLanguage', render: v => v ? escapeHtmlAttribute(v.toUpperCase()) : '', searchable: false, orderable: true },
    { title: t('admin.evalDashboard.columns.creatorEmail', 'Creator email'), data: 'creatorEmail', render: v => escapeHtmlAttribute(truncateEmail(v || '')), searchable: true, orderable: true },
    { title: t('admin.evalDashboard.columns.expertEmail', 'Expert Email'), data: 'expertEmail', render: v => escapeHtmlAttribute(truncateEmail(v || '')), searchable: true, orderable: true },
    { title: t('admin.evalDashboard.columns.date', 'Date'), data: 'date', render: (v) => formatDate(v), searchable: false, orderable: true }
  ]), [formatDate, t, lang]);

  return (
    <GcdsContainer layout="page" className="mb-600">
      <h1 className="mb-400">{t('admin.evalDashboard.title', 'Evaluation dashboard')}</h1>

      <nav className="mb-400" aria-label={t('admin.navigation.ariaLabel')}>
        <GcdsText>
          <GcdsLink href={`/${lang}/admin`}>{t('common.backToAdmin')}</GcdsLink>
        </GcdsText>
      </nav>

      <h2 className="mt-400 mb-400">{t('admin.evalDashboard.timeRangeTitle')}</h2>
      <div className="mb-600">
        <FilterPanel lang={lang} onApplyFilters={(filters) => { handleApplyFilters(filters); }} onClearFilters={handleClearFilters} isVisible={true} filterLoading={loading} filterError={error} filterResultCount={pageResultCount} hasAppliedFilters={hasAppliedFilters} />
      </div>

      {loading && (
        <div className="loading-overlay" role="status" aria-live="polite">
          <div className="loading-overlay-content">
            <div className="loading-animation" aria-hidden="true"></div>
            <span>{t('admin.evalDashboard.loading', 'Loading evaluations...')}</span>
          </div>
        </div>
      )}

      <StatusMessage
        message={error ? `${t('admin.evalDashboard.error')} ${String(error)}` : null}
        isError
        tag="div"
        className="mt-400 error"
      />

      {hasAppliedFilters && !loading && !error && pageResultCount === 0 && (
        <div className="dashboard-warning">
          <span className="dashboard-warning__icon" aria-hidden="true" />
          {t('common.noDataForFilters')}
        </div>
      )}

      {hasAppliedFilters && (
        <div className="mt-200">
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
                info: true,
                autoWidth: false,
                order: [[13, 'desc']],
                stateSave: true,
                layout: {
                  topStart: {
                    features: ['info', 'pageLength']
                  },
                  topEnd: { features: ['search', 'paging'] },
                  bottomStart: {
                    features: ['info', 'pageLength']
                  },
                  bottomEnd: 'paging'
                },
                infoCallback: function (_settings, start, end, _max, _total, _pre) {
                  const pageNumber = Math.floor(Math.max(Number(start) - 1, 0) / Math.max(end - start, 1)) + 1;
                  return `${t('common.page', 'Page')} ${pageNumber}`;
                },
                language: {
                  ...dataTableLanguage(lang),
                  search: t('admin.evalDashboard.searchLabel', 'Search'),
                  searchPlaceholder: t('admin.evalDashboard.searchPlaceholder', 'Enter search term...')
                },
                // Add per-column header inputs
                initComplete: function () {
                  try {
                    const api = this.api();
                    tableApiRef.current = api;
                    const debounce = (fn, wait = 300) => {
                      let t = null;
                      return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); };
                    };
                    api.columns().every(function (idx) {
                      const column = this;
                      const colInfo = column.settings()[0].aoColumns[idx] || {};
                      const colData = colInfo.data || '';
                      if (!colInfo.searchable) return;
                      const headerEl = column.header(); // DOM element
                      if (!headerEl) return;
                      const existingFilterContainer = headerEl.querySelector('.dt-col-filter-container');
                      if (existingFilterContainer) headerEl.removeChild(existingFilterContainer);
                      // Captured before the filter container is appended below, so this is
                      // just the column's own title text — used to give each generated
                      // input/select a unique accessible name (screen readers otherwise hear
                      // an identical, unlabeled "Filter" control for every column).
                      const colTitle = headerEl.textContent.trim();
                      const filterContainer = document.createElement('div');
                      filterContainer.className = 'dt-col-filter-container';
                      filterContainer.style.marginTop = '4px';
                      const booleanCols = [];
                      if (booleanCols.includes(colData)) {
                        const sel = document.createElement('select');
                        sel.className = 'dt-col-search';
                        sel.setAttribute('aria-label', `${t('admin.evalDashboard.columnFilterPlaceholder')} — ${colTitle}`);
                        const optAny = document.createElement('option'); optAny.value = ''; optAny.textContent = t('admin.evalDashboard.columns.any', 'Any'); sel.appendChild(optAny);
                        const optYes = document.createElement('option'); optYes.value = 'true'; optYes.textContent = t('common.yes', 'Yes'); sel.appendChild(optYes);
                        const optNo = document.createElement('option'); optNo.value = 'false'; optNo.textContent = t('common.no', 'No'); sel.appendChild(optNo);
                        sel.addEventListener('change', function () {
                          column.search(this.value);
                          api.page('first').draw('page');
                        });
                        filterContainer.appendChild(sel);
                      } else {
                        const input = document.createElement('input');
                        input.type = 'search';
                        input.className = 'dt-col-search';
                        input.placeholder = t('admin.evalDashboard.columnFilterPlaceholder', 'Filter');
                        input.setAttribute('aria-label', `${input.placeholder} — ${colTitle}`);
                        input.addEventListener('input', debounce(function (e) {
                          column.search(e.target.value);
                          api.page('first').draw('page');
                        }, 350));
                        filterContainer.appendChild(input);
                      }
                      // prevent clicks inside the filter container from sorting the column
                      const stopSort = (event) => event.stopPropagation();
                      filterContainer.addEventListener('click', stopSort);
                      filterContainer.addEventListener('mousedown', stopSort);
                      headerEl.appendChild(filterContainer);
                    });
                  } catch (e) { /* ignore initComplete errors */ }
                },
                // ajax collects per-column searches and sends them to backend
                ajax: async (dtParams, callback) => {
                  try {
                    setLoading(true);
                    setError(null);
                    const dtOrder = Array.isArray(dtParams.order) && dtParams.order.length > 0 ? dtParams.order[0] : { column: 13, dir: 'desc' };
                    const orderByMap = ['chatId', 'questionNumber', 'partnerEval', 'aiEval', 'feedback', 'hasDownload', 'department', 'program', 'action', 'referringUrl', 'pageLanguage', 'creatorEmail', 'expertEmail', 'createdAt'];
                    const orderBy = orderByMap[dtOrder.column] || 'createdAt';
                    const orderDir = dtOrder.dir || 'desc';
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
                    const query = {
                      ...filtersRef.current,
                      start: dtParams.start || 0,
                      length: dtParams.length || 10,
                      orderBy,
                      orderDir,
                      draw: dtParams.draw || 0
                    };
                    if (searchValue) query.search = searchValue;
                    if (Object.keys(columnSearches).length) query.columnSearch = columnSearches;
                    const result = await EvaluationService.getEvalDashboard(query);
                    const rows = Array.isArray(result?.data) ? result.data : [];
                    const start = Number.isFinite(Number(dtParams.start)) ? Number(dtParams.start) : 0;
                    const hasMore = result?.hasMore === true;
                    const syntheticCount = start + rows.length + (hasMore ? 1 : 0);
                    setPageResultCount(syntheticCount);
                    callback({ draw: dtParams.draw || 0, recordsTotal: syntheticCount, recordsFiltered: syntheticCount, data: rows });
                  } catch (err) {
                    console.error('Failed to load eval dashboard data', err);
                    setError(err.message || String(err));
                    setPageResultCount(0);
                    callback({ draw: dtParams.draw || 0, recordsTotal: 0, recordsFiltered: 0, data: [] });
                  } finally {
                    setLoading(false);
                  }
                },
                stateSaveCallback: function (settings, data) {
                  try { if (typeof window !== 'undefined' && window.localStorage) window.localStorage.setItem(LOCAL_TABLE_STORAGE_KEY, JSON.stringify(data)); } catch (e) { void e; }
                },
                stateLoadCallback: function () {
                  try { if (typeof window !== 'undefined' && window.localStorage) return JSON.parse(window.localStorage.getItem(LOCAL_TABLE_STORAGE_KEY)); } catch (e) { void e; }
                  return null;
                }
              }}
            >
              <caption className="sr-only">{t('admin.evalDashboard.title')}</caption>
            </DataTable>
            </div>
          )}
        </div>
      )}
    </GcdsContainer>
  );
};

export default EvalDashboardPage;
