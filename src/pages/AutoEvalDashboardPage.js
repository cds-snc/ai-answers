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
import { buildChatReviewLinkHtml, chatLangFromPageLanguage } from '../utils/reviewLink.js';
import { wireTableAccessibility, getHeaderTitleText } from '../utils/admin/dataTableAccessibility.js';
import { buildChatGroupCallbacks, createChatGroupState } from '../utils/admin/chatGroupedTable.js';
import { buildEvalPillsHtml } from '../utils/admin/evalPills.js';
import { renderDateTimeCell } from '../utils/admin/dateTimeCell.js';

DataTable.use(DT);

// v2: columns changed (Department added, Q # no longer searchable).
const TABLE_STORAGE_KEY = `autoEvalDashboard_tableState_v2_`;
// Filtered by a Yes/No/Any <select> instead of a text box (see initComplete).
const BOOLEAN_FILTER_COLUMNS = ['processed', 'hasMatches'];

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
  const chatGroupStateRef = useRef(createChatGroupState());
  // Bumped by Clear all and by each ajax call, so a response that lands
  // after the table was cleared (or superseded) can't set error/count/loading
  // state on a table that's gone.
  const ajaxSeqRef = useRef(0);
  // "Column: value" for each active column filter, captured per ajax call -
  // names the filters in the zero-result message (Chat/Eval name the search
  // term the same way) instead of blaming the date/department filters.
  const [activeColumnFilterText, setActiveColumnFilterText] = useState('');

  const LOCAL_TABLE_STORAGE_KEY = `${TABLE_STORAGE_KEY}${lang}`;

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
    // Same as EvalDashboardPage.js: clearing hides the results until the
    // next Apply (restart, not re-apply) - previously this reloaded the
    // default date range, so the table came straight back.
    ajaxSeqRef.current += 1;
    filtersRef.current = getDefaultEvalFilters();
    tableApiRef.current = null;
    setHasAppliedFilters(false);
    setPageResultCount(0);
    setError(null);
    setLoading(false);
  }, [LOCAL_TABLE_STORAGE_KEY]);

  // Columns: Chat ID, #, Department, AI eval, Partner eval, Processed, Matches, Fallback, No-match reason, Date
  const columns = useMemo(() => ([
    {
      title: t('admin.autoEvalDashboard.columns.chatId', 'Chat ID'),
      data: 'chatId',
      // Fixed width; the UUID wraps onto two lines (see .col-chat-id in admin.css).
      width: '150px',
      className: 'col-chat-id',
      render: (value, type, row) => {
        if (!value) return '';
        // Route to the reviewed chat's own pageLanguage, not the admin's
        // current UI language - see the same note in ChatDashboardPage.js.
        const chatLang = chatLangFromPageLanguage(row.pageLanguage);
        return buildChatReviewLinkHtml(value, chatLang, row.interactionId || row._id, lang);
      },
      searchable: true,
      orderable: true
    },
    {
      // Header shows "#"; aria-label spells it out (initComplete).
      title: t('admin.evalDashboard.columns.questionNumber'),
      // Feeds DataTables' sort-button aria-label (built at init; the th
      // aria-label set in initComplete is too late for that).
      ariaTitle: t('admin.evalDashboard.columns.questionNumberAriaLabel'),
      data: 'questionNumber',
      render: (value) => value != null ? String(value) : '',
      width: '40px',
      // No filter: columnSearch is a text $regex and coerces "1"/"0" to
      // booleans, so a numeric filter can't work.
      searchable: false,
      orderable: true
    },
    { title: t('admin.common.columns.department'), data: 'department', width: '130px', searchable: true, orderable: true },
    // Shared with EvalDashboardPage.js; hasCitationError is a separate
    // flag from the endpoint, not part of aiEval/partnerEval.
    {
      title: t('admin.chatDashboard.columns.aiEval'), data: 'aiEval', width: '170px', render: (v, type, row) => buildEvalPillsHtml(t, v, [
        { active: row && row.aiHasCitationError, className: 'hasCitationError', labelKey: 'admin.chatDashboard.labels.evaluation.hasCitationError' }
      ]), searchable: true, orderable: true
    },
    {
      title: t('admin.chatDashboard.columns.partnerEval'), data: 'partnerEval', width: '170px', render: (v, type, row) => buildEvalPillsHtml(t, v, [
        { active: row && row.partnerHasCitationError, className: 'hasCitationError', labelKey: 'admin.chatDashboard.labels.evaluation.hasCitationError' },
        { active: row && row.partnerHasContentIssue, className: 'hasContentIssue', labelKey: 'admin.chatDashboard.labels.contentIssue' }
      ]), searchable: true, orderable: true
    },
    { title: t('admin.autoEvalDashboard.columns.processed', 'Processed'), data: 'processed', render: v => v ? t('common.yes', 'Yes') : t('common.no', 'No'), searchable: true, orderable: false },
    { title: t('admin.autoEvalDashboard.columns.matches', 'Has matches'), data: 'hasMatches', render: v => v ? t('common.yes', 'Yes') : t('common.no', 'No'), searchable: true, orderable: false },
    // TODO: fallbackType is a raw internal code shown untranslated (only value
    // today: 'qa-high-score' - the evaluation was inherited from a similar
    // past expert-scored Q&A, see services/evaluation.worker.js). Map it
    // through t() like noMatchReasonType does with eval.noMatchReasonTypes.*,
    // and switch its filter to the Yes/No/Any select since there is one value.
    { title: t('admin.autoEvalDashboard.columns.fallback', 'Fallback'), data: 'fallbackType', className: 'col-nowrap', searchable: true, orderable: true },
    { title: t('admin.autoEvalDashboard.columns.reason', 'No-match reason'), data: 'noMatchReasonType', render: (v) => v ? t(`eval.noMatchReasonTypes.${v}`, v) : '', searchable: true, orderable: true },
    { title: t('admin.autoEvalDashboard.columns.date', 'Date'), data: 'date', render: (v) => renderDateTimeCell(v, lang), searchable: true, orderable: true }
  ]), [t, lang]);

  return (
    <GcdsContainer layout="page" className="mb-600">
      <h1 className="mb-400">{t('admin.autoEvalDashboard.title', 'Auto-Evaluation dashboard')}</h1>

      <nav className="mb-400" aria-label={t('admin.navigation.ariaLabel')}>
        <GcdsText>
          <GcdsLink href={`/${lang}/admin`}>{t('common.backToAdmin')}</GcdsLink>
        </GcdsText>
      </nav>

      {/* Visually hidden - same as Chat/Eval/Metrics dashboards' matching
          heading: FilterPanel's own <summary> isn't heading-navigable, so
          this gives screen-reader users a heading/landmark entry point into
          the filter section. Distinct text from FilterPanel's "Filters"
          summary label. */}
      <h2 className="sr-only">{t('admin.filters.sectionHeading')}</h2>
      <div className="mb-100">
        <FilterPanel lang={lang} onApplyFilters={(filters) => { handleApplyFilters(filters); }} onClearFilters={handleClearFilters} isVisible={true} filterLoading={loading} filterError={error} filterResultCount={pageResultCount} hasAppliedFilters={hasAppliedFilters} />
      </div>

      {loading && (
        <LoadingOverlay message={t('admin.autoEvalDashboard.loading')} />
      )}

      <StatusMessage variant={error ? 'error' : undefined}>
        {error && <>{t('admin.autoEvalDashboard.error')} <code lang="en">{String(error)}</code></>}
      </StatusMessage>

      {hasAppliedFilters && !loading && !error && pageResultCount === 0 && (
        <StatusMessage
          variant="info"
          message={activeColumnFilterText
            ? t('admin.autoEvalDashboard.noColumnFilterResults').replace('{term}', () => activeColumnFilterText)
            : t('common.noDataForFilters')}
          nonce={zeroResultNonce}
        />
      )}

      {hasAppliedFilters && (
        <div>
          {dataTableReady && (
            <div className="dashboard-table-container dashboard-table-container--grouped">
            {/* Heading-navigation stop for the results, as on Chat/Eval. */}
            <h2 className="sr-only">{t('admin.common.resultsHeading')}</h2>
            <DataTable
              key={tableKey}
              columns={columns}
              className="display dashboard-table dashboard-table--grouped"
              options={{
                processing: true,
                serverSide: true,
                paging: true,
                searching: true,
                ordering: true,
                info: true,
                autoWidth: false,
                order: [[columns.length - 1, 'desc']],
                stateSave: true,
                // Same bottom row as Chat/Eval; no search slot (per-column
                // filters instead). Previously every control rendered twice.
                layout: {
                  topStart: {},
                  topEnd: {},
                  bottomStart: { features: ['pageLength', 'info'] },
                  bottomEnd: { paging: { firstLast: false } }
                },
                infoCallback: function (_settings, start, end, _max, _total, _pre) {
                  const pageNumber = Math.floor(Math.max(Number(start) - 1, 0) / Math.max(end - start, 1)) + 1;
                  return `${t('common.page', 'Page')} ${pageNumber}`;
                },
                language: dataTableLanguage(lang),
                // Striping and keep-chat-together cells - see
                // utils/admin/chatGroupedTable.js. A column filter can drop
                // some of a chat's turns, so a group is the matching rows.
                ...buildChatGroupCallbacks({
                  stateRef: chatGroupStateRef,
                  columns,
                  groupedColumns: [
                    { data: 'department' },
                    { data: 'chatId', boundByChatId: false, extraClass: 'chat-id-cell' },
                  ],
                }),
                initComplete: function () {
                  try {
                    const api = this.api();
                    tableApiRef.current = api;
                    // scope="col" headers only - wireTableAccessibility's
                    // search-term pill/announcement half is a no-op here (it
                    // bails out once it finds no .dt-search container), which
                    // is correct: this table has per-column filter inputs
                    // instead of one global search box, so it's not yet
                    // decided whether/how that half of the shared pattern
                    // (utils/admin/dataTableAccessibility.js +
                    // hooks/admin/useSearchAnnouncement.js, used by
                    // ChatDashboardPage.js/EvalDashboardPage.js/
                    // MetricsDashboard.js) should apply to a per-column-filter
                    // table like this one.
                    wireTableAccessibility(api, { t });
                    // "#" header: aria-label spells it out. Set before the
                    // filter inputs below, which take their names from it.
                    const questionNumberHeader = api.column(columns.findIndex((c) => c.data === 'questionNumber')).header();
                    if (questionNumberHeader) {
                      questionNumberHeader.setAttribute('aria-label', t('admin.evalDashboard.columns.questionNumberAriaLabel'));
                    }
                    // Blue fill on a box that holds a filter, like the sorted column's
                    // highlight - the one visible sign the table is filtered.
                    const markActive = (control) => control.classList.toggle('dt-col-search--active', Boolean(control.value));
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
                      // Names each filter control after its column.
                      const colTitle = headerEl.getAttribute('aria-label') || getHeaderTitleText(headerEl);
                      // Keeps the header's accessible name to its title once a
                      // filter control (and a <select>'s option text) lives inside it.
                      headerEl.setAttribute('aria-label', colTitle);
                      const filterContainer = document.createElement('div');
                      filterContainer.className = 'dt-col-filter-container';
                      filterContainer.style.marginTop = '4px';
                      if (BOOLEAN_FILTER_COLUMNS.includes(colData)) {
                        const sel = document.createElement('select');
                        sel.className = 'dt-col-search';
                        sel.setAttribute('aria-label', `${t('admin.common.filterPlaceholder')} — ${colTitle}`);
                        const optAny = document.createElement('option'); optAny.value = ''; optAny.textContent = t('admin.autoEvalDashboard.columns.any', 'Any'); sel.appendChild(optAny);
                        const optYes = document.createElement('option'); optYes.value = 'true'; optYes.textContent = t('common.yes', 'Yes'); sel.appendChild(optYes);
                        const optNo = document.createElement('option'); optNo.value = 'false'; optNo.textContent = t('common.no', 'No'); sel.appendChild(optNo);
                        sel.addEventListener('change', function () {
                          markActive(sel);
                          column.search(this.value);
                          api.page('first').draw('page');
                        });
                        // stateSave restores the filter value silently; show it.
                        sel.value = column.search() || '';
                        markActive(sel);
                        filterContainer.appendChild(sel);
                      } else {
                        const input = document.createElement('input');
                        input.type = 'search';
                        input.className = 'dt-col-search';
                        // Default size=20 (~180px) forced narrow columns open;
                        // size=1 + width:100% (admin.css) fits the column.
                        input.size = 1;
                        input.placeholder = t('admin.common.filterPlaceholder');
                        input.setAttribute('aria-label', `${input.placeholder} — ${colTitle}`);
                        input.addEventListener('input', function () { markActive(input); });
                        // The native clear (x) fires 'search', not 'input', in Safari
                        // (Chrome fires both) - without this the text vanished but
                        // the column stayed filtered. Immediate, no debounce.
                        input.addEventListener('search', function () {
                          // Only the clear case: Chrome also fires 'search' on
                          // Enter, which the debounced input handler already covers.
                          if (input.value !== '') return;
                          markActive(input);
                          column.search('');
                          api.page('first').draw('page');
                        });
                        input.addEventListener('input', debounce(function (e) {
                          column.search(e.target.value);
                          api.page('first').draw('page');
                        }, 350));
                        input.value = column.search() || '';
                        markActive(input);
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
                  const seq = ++ajaxSeqRef.current;
                  try {
                    setLoading(true);
                    setError(null);
                    const dtOrder = Array.isArray(dtParams.order) && dtParams.order.length > 0 ? dtParams.order[0] : { column: columns.length - 1, dir: 'desc' };
                    // Derived from `columns` so it can't desync; only Date's
                    // key differs from the backend field name.
                    const orderByMap = columns.map((c) => (c.data === 'date' ? 'createdAt' : c.data));
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
                    setActiveColumnFilterText(columns
                      .filter((c) => columnSearches[c.data])
                      .map((c) => `${c.data === 'questionNumber' ? t('admin.evalDashboard.columns.questionNumberAriaLabel') : c.title}: ${columnSearches[c.data]}`)
                      .join(', '));
                    const result = await EvaluationService.getEvalDashboard(query);
                    if (seq !== ajaxSeqRef.current) return;
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
                    const syntheticUnitCount = orderBy === 'createdAt'
                      ? new Set(rows.map((r) => r.chatId)).size
                      : rows.length;
                    const syntheticCount = start + syntheticUnitCount + (hasMore ? 1 : 0);
                    setPageResultCount(syntheticCount);
                    if (syntheticCount === 0) setZeroResultNonce((n) => n + 1);
                    callback({ draw: dtParams.draw || 0, recordsTotal: syntheticCount, recordsFiltered: syntheticCount, data: rows });
                  } catch (err) {
                    console.error('Failed to load auto-eval dashboard data', err);
                    if (seq !== ajaxSeqRef.current) return;
                    setError(err.message || String(err));
                    setPageResultCount(0);
                    callback({ draw: dtParams.draw || 0, recordsTotal: 0, recordsFiltered: 0, data: [] });
                  } finally {
                    if (seq === ajaxSeqRef.current) setLoading(false);
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
