import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GcdsContainer, GcdsText, GcdsLink } from '@gcds-core/components-react';
import DataTable from 'datatables.net-react';
import DT from 'datatables.net-dt';
import { useTranslations } from '../hooks/useTranslations.js';
import { dataTableLanguage } from '../utils/dataTableLanguage.js';
import FilterPanel from '../components/admin/FilterPanel.js';
import EvaluationService from '../services/EvaluationService.js';
import StatusMessage from '../components/admin/StatusMessage.js';
import LoadingOverlay from '../components/admin/LoadingOverlay.js';
import { escapeHtmlAttribute, buildChatReviewLinkHtml } from '../utils/reviewLink.js';

DataTable.use(DT);

const TABLE_STORAGE_KEY = `autoEvalDashboard_tableState_v1_`;

const getDefaultEvalFilters = () => {
  const now = new Date();
  const start = new Date(now);
  start.setDate(now.getDate() - 7);
  return {
    startDate: start.toISOString(),
    endDate: now.toISOString()
  };
};
const AutoEvalDashboardPage = ({ lang = 'en' }) => {
  const { t } = useTranslations(lang);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [tableKey, setTableKey] = useState(0);
  const [dataTableReady, setDataTableReady] = useState(false);
  const [pageResultCount, setPageResultCount] = useState(0);
  const [hasAppliedFilters, setHasAppliedFilters] = useState(false);
  // The zero-result StatusMessage below is a plain conditional render with
  // no nonce, so two different zero-result triggers (e.g. one filter
  // change into another that also matches nothing) render identical text
  // and produce no DOM change - a screen reader user gets no indication
  // the second query even ran. nonce forces a fresh node each time (same
  // pattern as EvalDashboardPage.js/ChatDashboardPage.js's own zero-result
  // fix). Bumped on every ajax completion that lands on zero - a 0-result
  // page can't be paged further, so every such completion is a genuinely
  // new query, not a repeat draw of the same one.
  const [zeroResultNonce, setZeroResultNonce] = useState(0);

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

  // Columns: Chat ID, Interaction ID, Department, Page Language, AutoEval, Processed, Has matches, Fallback, No-match reason, Date
  const columns = useMemo(() => ([
    {
      title: t('admin.autoEvalDashboard.columns.chatId', 'Chat ID'),
      data: 'chatId',
      render: (value, type, row) => {
        if (!value) return '';
        const chatLang = row.pageLanguage && (row.pageLanguage.toLowerCase().includes('fr')) ? 'fr' : 'en';
        return buildChatReviewLinkHtml(value, chatLang, row.interactionId || row._id);
      },
      searchable: true,
      orderable: true
    },
    {
      title: t('admin.autoEvalDashboard.columns.questionNumber', 'Q #'),
      data: 'questionNumber',
      render: (value) => value != null ? String(value) : '',
      width: '40px',
      searchable: true,
      orderable: true
    },
    { title: t('admin.chatDashboard.columns.aiEval', 'AI Eval'), data: 'aiEval', render: v => { if (!v) return ''; const label = t(`admin.chatDashboard.labels.evaluation.${v}`); return `<span class="label ${escapeHtmlAttribute(v)}">${escapeHtmlAttribute(label.includes('.') ? v : label)}</span>`; }, searchable: true, orderable: true },
    { title: t('admin.chatDashboard.columns.partnerEval', 'Partner Eval'), data: 'partnerEval', render: (v, type, row) => { let html = ''; if (v) { const label = t(`admin.chatDashboard.labels.evaluation.${v}`); html += `<span class="label ${escapeHtmlAttribute(v)}">${escapeHtmlAttribute(label.includes('.') ? v : label)}</span>`; } if (row && row.partnerHasContentIssue) { const contentIssueLabel = t('admin.chatDashboard.labels.contentIssue'); html += `<span class="label hasContentIssue">${escapeHtmlAttribute(contentIssueLabel)}</span>`; } return html; }, searchable: true, orderable: true },
    { title: t('admin.autoEvalDashboard.columns.processed', 'Processed'), data: 'processed', render: v => v ? t('common.yes', 'Yes') : t('common.no', 'No'), searchable: true, orderable: true },
    { title: t('admin.autoEvalDashboard.columns.matches', 'Has matches'), data: 'hasMatches', render: v => v ? t('common.yes', 'Yes') : t('common.no', 'No'), searchable: true, orderable: true },
    { title: t('admin.autoEvalDashboard.columns.fallback', 'Fallback'), data: 'fallbackType', searchable: true, orderable: true },
    { title: t('admin.autoEvalDashboard.columns.reason', 'No-match reason'), data: 'noMatchReasonType', render: (v) => v ? t(`eval.noMatchReasonTypes.${v}`, v) : '', searchable: true, orderable: true },
    { title: t('admin.autoEvalDashboard.columns.date', 'Date'), data: 'date', render: (v) => formatDate(v), searchable: true, orderable: true }
  ]), [formatDate, t]);

  return (
    <GcdsContainer layout="page" className="mb-600">
      <h1 className="mb-400">{t('admin.autoEvalDashboard.title', 'Auto-Evaluation dashboard')}</h1>

      <nav className="mb-400" aria-label={t('admin.navigation.ariaLabel')}>
        <GcdsText>
          <GcdsLink href={`/${lang}/admin`}>{t('common.backToAdmin')}</GcdsLink>
        </GcdsText>
      </nav>

      <h2 className="mt-400 mb-400">{t('admin.autoEvalDashboard.timeRangeTitle')}</h2>
      <div className="mb-600">
        <FilterPanel lang={lang} onApplyFilters={(filters) => { handleApplyFilters(filters); }} onClearFilters={handleClearFilters} isVisible={true} filterLoading={loading} filterError={error} filterResultCount={pageResultCount} hasAppliedFilters={hasAppliedFilters} />
      </div>

      {loading && (
        <LoadingOverlay message={t('admin.autoEvalDashboard.loading')} />
      )}

      <StatusMessage
        variant={error ? 'error' : undefined}
        message={error ? `${t('admin.autoEvalDashboard.error')} ${String(error)}` : null}
      />

      {hasAppliedFilters && !loading && !error && pageResultCount === 0 && (
        <StatusMessage variant="info" message={t('common.noDataForFilters')} nonce={zeroResultNonce} />
      )}

      {hasAppliedFilters && (
        <div className="mt-200">
          {dataTableReady && (
            <div className="dashboard-table-container">
            <DataTable
              key={tableKey}
              columns={columns}
              className="display dashboard-table"
              options={{
                processing: true,
                serverSide: true,
                paging: true,
                searching: true,
                ordering: true,
                info: true,
                autoWidth: false,
                order: [[8, 'desc']],
                stateSave: true,
                layout: {
                  topStart: {
                    features: ['info', 'pageLength']
                  },
                  topEnd: 'paging',
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
                  search: t('admin.autoEvalDashboard.searchLabel', 'Search'),
                  searchPlaceholder: t('admin.autoEvalDashboard.searchPlaceholder')
                },
                initComplete: function () {
                  try {
                    const api = this.api();
                    tableApiRef.current = api;
                    // TODO: no scope="col" headers, no search-term pill, no
                    // sr-only search-results announcement here (unlike
                    // ChatDashboardPage.js/EvalDashboardPage.js/
                    // MetricsDashboard.js, which all share
                    // utils/admin/dataTableAccessibility.js +
                    // hooks/admin/useSearchAnnouncement.js). Needs
                    // assessment: this table has per-column filter inputs
                    // instead of one global search box, so it's not yet
                    // decided whether/how the shared pattern should apply.
                    const debounce = (fn, wait = 300) => {
                      let t = null;
                      return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); };
                    };
                    api.columns().every(function (idx) {
                      const column = this;
                      const colInfo = column.settings()[0].aoColumns[idx] || {};
                      const colData = colInfo.data || '';
                      if (!colInfo.searchable) return;
                      const headerEl = column.header();
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
                      const booleanCols = ['processed', 'hasMatches'];
                      if (booleanCols.includes(colData)) {
                        const sel = document.createElement('select');
                        sel.className = 'dt-col-search';
                        sel.setAttribute('aria-label', `${t('admin.autoEvalDashboard.columnFilterPlaceholder')} — ${colTitle}`);
                        const optAny = document.createElement('option'); optAny.value = ''; optAny.textContent = t('admin.autoEvalDashboard.columns.any', 'Any'); sel.appendChild(optAny);
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
                        input.placeholder = t('admin.autoEvalDashboard.columnFilterPlaceholder', 'Filter');
                        input.setAttribute('aria-label', `${input.placeholder} — ${colTitle}`);
                        input.addEventListener('input', debounce(function (e) {
                          column.search(e.target.value);
                          api.page('first').draw('page');
                        }, 350));
                        filterContainer.appendChild(input);
                      }
                      const stopSort = (event) => event.stopPropagation();
                      filterContainer.addEventListener('click', stopSort);
                      filterContainer.addEventListener('mousedown', stopSort);
                      // DataTables' own header sort-activation binds both
                      // click.DT AND keypress.DT (Enter) for keyboard
                      // accessibility (_fnBindAction in dataTables.mjs) -
                      // without also stopping keypress here, pressing Enter
                      // while typing in this filter input bubbles up to that
                      // handler and sorts the column as an unintended side
                      // effect.
                      filterContainer.addEventListener('keypress', stopSort);
                      headerEl.appendChild(filterContainer);
                    });
                  } catch (e) { /* ignore initComplete errors */ }
                },
                ajax: async (dtParams, callback) => {
                  try {
                    setLoading(true);
                    setError(null);
                    const dtOrder = Array.isArray(dtParams.order) && dtParams.order.length > 0 ? dtParams.order[0] : { column: 8, dir: 'desc' };
                    const orderByMap = ['chatId', 'questionNumber', 'aiEval', 'partnerEval', 'processed', 'hasMatches', 'fallbackType', 'noMatchReasonType', 'createdAt'];
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
                    // This page shares the eval-dashboard.js endpoint with
                    // EvalDashboardPage.js, which paginates by distinct
                    // chatId count (not row count) for the default createdAt
                    // sort - see useChatGroupedPagination there. Using raw
                    // row count here for that same sort was the exact
                    // phantom-page bug fixed on EvalDashboardPage.js: a
                    // multi-question chat inflates row count past the
                    // requested page length, so the synthetic total kept
                    // implying a next page that didn't exist, and clicking
                    // it returned nothing.
                    //
                    // TODO: this page hasn't otherwise been updated for
                    // that endpoint's other recent changes (auto-eval work
                    // is out of scope for now) - specifically, aiEval/
                    // partnerEval no longer include hasCitationError as a
                    // value (EvalDashboardPage.js shows it as a separate
                    // stacking pill instead), so a citation-only-error row
                    // here silently renders as whatever the sentence-score
                    // fallback is instead of showing the citation problem.
                    // Extend the same *WithoutCitation-aware pill rendering
                    // here too when this page is revisited.
                    const syntheticUnitCount = orderBy === 'createdAt'
                      ? new Set(rows.map((r) => r.chatId)).size
                      : rows.length;
                    const syntheticCount = start + syntheticUnitCount + (hasMore ? 1 : 0);
                    setPageResultCount(syntheticCount);
                    if (syntheticCount === 0) setZeroResultNonce((n) => n + 1);
                    callback({ draw: dtParams.draw || 0, recordsTotal: syntheticCount, recordsFiltered: syntheticCount, data: rows });
                  } catch (err) {
                    console.error('Failed to load auto-eval dashboard data', err);
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
              <caption className="sr-only">{t('admin.autoEvalDashboard.title')}</caption>
            </DataTable>
            </div>
          )}
        </div>
      )}
    </GcdsContainer>
  );
};

export default AutoEvalDashboardPage;
