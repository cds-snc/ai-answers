import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GcdsContainer, GcdsText, GcdsLink } from '@cdssnc/gcds-components-react';
import DataTable from 'datatables.net-react';
import DT from 'datatables.net-dt';
import { useTranslations } from '../hooks/useTranslations.js';
import FilterPanel from '../components/admin/FilterPanel.js';
import EvaluationService from '../services/EvaluationService.js';

DataTable.use(DT);

const escapeHtmlAttribute = (value) => {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
};

const TABLE_STORAGE_KEY = `evalDashboard_tableState_v1_`;

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
  const [recordsTotal, setRecordsTotal] = useState(0);
  const [recordsFiltered, setRecordsFiltered] = useState(0);
  const [hasAppliedFilters, setHasAppliedFilters] = useState(false);

  const tableApiRef = useRef(null);
  const filtersRef = useRef(getDefaultEvalFilters());

  const LOCAL_TABLE_STORAGE_KEY = `${TABLE_STORAGE_KEY}${lang}`;

  const numberFormatter = useMemo(
    () => new Intl.NumberFormat(lang === 'fr' ? 'fr-CA' : 'en-CA'),
    [lang]
  );

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
    try {
      if (tableApiRef.current) tableApiRef.current.ajax.reload();
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
    try { if (tableApiRef.current) tableApiRef.current.ajax.reload(); } catch (e) { void e; }
  }, [LOCAL_TABLE_STORAGE_KEY]);

  const resultsSummary = useMemo(() => {
    const template = t('admin.evalDashboard.resultsSummary', 'Total matching evaluations: {count}');
    return template.replace('{count}', numberFormatter.format(recordsFiltered));
  }, [numberFormatter, recordsFiltered, t]);

  const totalSummary = useMemo(() => {
    const template = t('admin.evalDashboard.totalCount', 'Total eval rows in range: {total}');
    return template.replace('{total}', numberFormatter.format(recordsTotal));
  }, [numberFormatter, recordsTotal, t]);

  const columns = useMemo(() => ([
    {
      title: t('admin.evalDashboard.columns.chatId', 'Chat ID'),
      data: 'chatId',
      render: (value, type, row) => {
        if (!value) return '';
        const safeId = escapeHtmlAttribute(value);
        const chatLang = row.pageLanguage && (row.pageLanguage.toLowerCase().includes('fr')) ? 'fr' : 'en';
        const interactionId = row.interactionId || row._id || '';
        // target DOM ids are prefixed with 'interactionId' so include that prefix in the hash
        const prefixed = interactionId ? `interactionId${interactionId}` : '';
        const hash = prefixed ? `#interaction=${encodeURIComponent(prefixed)}` : '';
        return `<a href="/${chatLang}?chat=${safeId}&review=1${hash}" target="_blank" rel="noopener noreferrer">${safeId}</a>`;
      },
      searchable: true,
      orderable: true
    },
    {
      title: t('admin.evalDashboard.columns.questionNumber', 'Q #'),
      data: 'questionNumber',
      render: (value) => value != null ? String(value) : '',
      width: '40px',
      searchable: true,
      orderable: true
    },
    { title: t('admin.chatDashboard.columns.partnerEval', 'Partner Eval'), data: 'partnerEval', render: v => { if (!v || v === 'none') return ''; const key = `admin.chatDashboard.labels.evaluation.${v}`; const label = t(key); return `<span class="label ${escapeHtmlAttribute(v)}">${escapeHtmlAttribute(label.includes('.') ? v : label)}</span>`; }, searchable: true, orderable: true },
    { title: t('admin.chatDashboard.columns.aiEval', 'AI Eval'), data: 'aiEval', render: v => { if (!v || v === 'none') return ''; const key = `admin.chatDashboard.labels.evaluation.${v}`; const label = t(key); return `<span class="label ${escapeHtmlAttribute(v)}">${escapeHtmlAttribute(label.includes('.') ? v : label)}</span>`; }, searchable: true, orderable: true },
    { title: t('admin.evalDashboard.columns.department', 'Department'), data: 'department', searchable: true, orderable: true },
    { title: t('admin.chatDashboard.columns.referringUrl', 'Referring URL'), data: 'referringUrl', render: v => v ? escapeHtmlAttribute(truncateUrl(v)) : '<span style="font-style: italic; color: #666;">none</span>', searchable: true, orderable: true },
    { title: t('admin.evalDashboard.columns.pageLanguage', 'Page'), data: 'pageLanguage', render: v => v ? escapeHtmlAttribute(v.toUpperCase()) : '', searchable: true, orderable: true },
    { title: t('admin.evalDashboard.columns.creatorEmail', 'Creator email'), data: 'creatorEmail', render: v => escapeHtmlAttribute(truncateEmail(v || '')), searchable: true, orderable: true },
    { title: t('admin.evalDashboard.columns.expertEmail', 'Expert Email'), data: 'expertEmail', render: v => escapeHtmlAttribute(truncateEmail(v || '')), searchable: true, orderable: true },
    { title: t('admin.evalDashboard.columns.date', 'Date'), data: 'date', render: (v) => formatDate(v), searchable: true, orderable: true }
  ]), [formatDate, t]);

  return (
    <GcdsContainer size="xl" mainContainer centered tag="main" className="mb-600">
      <h1 className="mb-400">{t('admin.evalDashboard.title', 'Evaluation dashboard')}</h1>

      <nav className="mb-400" aria-label={t('admin.navigation.ariaLabel', 'Admin Navigation')}>
        <GcdsText>
          <GcdsLink href={`/${lang}/admin`}>{t('common.backToAdmin', 'Back to Admin')}</GcdsLink>
        </GcdsText>
      </nav>

      <p className="mb-400">{t('admin.evalDashboard.description', 'Filter evaluations and explore details in the table below.')}</p>

      <FilterPanel onApplyFilters={(filters) => { handleApplyFilters(filters); }} onClearFilters={handleClearFilters} isVisible={true} />

      {loading && (
        <div className="loading-overlay" role="status" aria-live="polite">
          <div className="loading-overlay-content">
            <div className="loading-animation" aria-hidden="true"></div>
            <span>{t('admin.evalDashboard.loading', 'Loading evaluations...')}</span>
          </div>
        </div>
      )}

      {error && (<div className="mt-400 error" role="alert">{t('admin.evalDashboard.error', 'Unable to load eval data.')} {String(error)}</div>)}

      {hasAppliedFilters && (
        <div className="mt-400">
          <div className="mb-200"><div>{resultsSummary}</div><div>{totalSummary}</div></div>
          {dataTableReady && (
            <DataTable
              key={tableKey}
              columns={columns}
              options={{
                processing: true,
                serverSide: true,
                paging: true,
                searching: true,
                ordering: true,
                order: [[9, 'desc']],
                stateSave: true,
                language: {
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
                      const filterContainer = document.createElement('div');
                      filterContainer.className = 'dt-col-filter-container';
                      filterContainer.style.marginTop = '4px';
                      const booleanCols = [];
                      if (booleanCols.includes(colData)) {
                        const sel = document.createElement('select');
                        sel.className = 'dt-col-search';
                        const optAny = document.createElement('option'); optAny.value = ''; optAny.textContent = t('admin.evalDashboard.columns.any', 'Any'); sel.appendChild(optAny);
                        const optYes = document.createElement('option'); optYes.value = 'true'; optYes.textContent = t('common.yes', 'Yes'); sel.appendChild(optYes);
                        const optNo = document.createElement('option'); optNo.value = 'false'; optNo.textContent = t('common.no', 'No'); sel.appendChild(optNo);
                        sel.addEventListener('change', function () {
                          column.search(this.value).draw();
                        });
                        filterContainer.appendChild(sel);
                      } else {
                        const input = document.createElement('input');
                        input.type = 'search';
                        input.className = 'dt-col-search';
                        input.placeholder = t('admin.evalDashboard.columnFilterPlaceholder', 'Filter');
                        input.addEventListener('input', debounce(function (e) {
                          column.search(e.target.value).draw();
                        }, 350));
                        filterContainer.appendChild(input);
                      }
                      // prevent clicks inside the filter container from sorting the column
                      const stopSort = (event) => event.stopPropagation();
                      filterContainer.addEventListener('click', stopSort);
                      filterContainer.addEventListener('mousedown', stopSort);
                      headerEl.appendChild(filterContainer);
                    });
                    api.on('xhr.dt', function (_e, _settings, json) {
                      try { setRecordsTotal((json && json.recordsTotal) || 0); setRecordsFiltered((json && json.recordsFiltered) || 0); } catch (e) { /* ignore */ }
                    });
                  } catch (e) { /* ignore initComplete errors */ }
                },
                // ajax collects per-column searches and sends them to backend
                ajax: async (dtParams, callback) => {
                  try {
                    setLoading(true);
                    setError(null);
                    const dtOrder = Array.isArray(dtParams.order) && dtParams.order.length > 0 ? dtParams.order[0] : { column: 9, dir: 'desc' };
                    const orderByMap = ['chatId', 'questionNumber', 'partnerEval', 'aiEval', 'department', 'referringUrl', 'pageLanguage', 'creatorEmail', 'expertEmail', 'createdAt'];
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
                    setRecordsTotal(result?.recordsTotal || 0);
                    setRecordsFiltered(result?.recordsFiltered || 0);
                    callback({ draw: dtParams.draw || 0, recordsTotal: result?.recordsTotal || 0, recordsFiltered: result?.recordsFiltered || 0, data: Array.isArray(result?.data) ? result.data : [] });
                  } catch (err) {
                    console.error('Failed to load eval dashboard data', err);
                    setError(err.message || String(err));
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
            />
          )}
        </div>
      )}
    </GcdsContainer>
  );
};

export default EvalDashboardPage;
