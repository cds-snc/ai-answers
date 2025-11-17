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

const EvalDashboardPage = ({ lang = 'en' }) => {
  const { t } = useTranslations(lang);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [tableKey, setTableKey] = useState(0);
  const [dataTableReady, setDataTableReady] = useState(false);
  const [recordsTotal, setRecordsTotal] = useState(0);
  const [recordsFiltered, setRecordsFiltered] = useState(0);

  const tableApiRef = useRef(null);
  const filtersRef = useRef({});

  const LOCAL_TABLE_STORAGE_KEY = `${TABLE_STORAGE_KEY}${lang}`;
  const FILTER_PANEL_STORAGE_KEY = 'evalFilterPanelState_v1';

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

  // On load, restore saved FilterPanel state (separate key from chat dashboard)
  useEffect(() => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const raw = window.localStorage.getItem(FILTER_PANEL_STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          const filters = {};
          if (parsed) {
            if (parsed.department) filters.department = parsed.department;
            if (parsed.referringUrl) filters.referringUrl = parsed.referringUrl;
            if (parsed.filterType) {
              filters.filterType = parsed.filterType;
              if (parsed.filterType === 'preset') {
                filters.presetValue = parsed.presetValue;
                if (parsed.presetValue !== 'all' && parsed.dateRange) {
                  if (parsed.dateRange.startDate) {
                    const sd = new Date(parsed.dateRange.startDate);
                    if (!Number.isNaN(sd.getTime())) filters.startDate = sd.toISOString();
                  }
                  if (parsed.dateRange.endDate) {
                    const ed = new Date(parsed.dateRange.endDate);
                    if (!Number.isNaN(ed.getTime())) filters.endDate = ed.toISOString();
                  }
                }
              } else if (parsed.filterType === 'custom' && parsed.dateRange) {
                if (parsed.dateRange.startDate) {
                  const sd = new Date(parsed.dateRange.startDate);
                  if (!Number.isNaN(sd.getTime())) filters.startDate = sd.toISOString();
                }
                if (parsed.dateRange.endDate) {
                  const ed = new Date(parsed.dateRange.endDate);
                  if (!Number.isNaN(ed.getTime())) filters.endDate = ed.toISOString();
                }
              }
            }
          }
          filtersRef.current = filters;
          // mark ready to render table after we've restored filters
          setTimeout(() => setDataTableReady(true), 0);
        }
      }
    } catch (e) {
      // ignore
    }
    // if no stored filters, still allow table to render
    setTimeout(() => setDataTableReady(true), 0);
  }, []);

  const handleApplyFilters = useCallback((filters) => {
    filtersRef.current = filters || {};
    try {
      if (tableApiRef.current) tableApiRef.current.ajax.reload();
      else setTableKey((prev) => prev + 1);
    } catch (e) { void e; }
  }, []);

  const handleClearFilters = useCallback(() => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        try { window.localStorage.removeItem(LOCAL_TABLE_STORAGE_KEY); } catch (e) { void e; }
        try { window.localStorage.removeItem(FILTER_PANEL_STORAGE_KEY); } catch (e) { void e; }
      }
    } catch (e) { void e; }
    setTableKey((prev) => prev + 1);
    filtersRef.current = {};
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
        return `<a href="/${chatLang}?chat=${safeId}&review=1${hash}">${safeId}</a>`;
      }
    },
    {
      title: t('admin.evalDashboard.columns.interactionId', 'Interaction ID'),
      data: 'interactionId',
      render: (value, type, row) => {
        const id = value || row._id || '';
        if (!id) return '';
        const chatLang = row.pageLanguage && (row.pageLanguage.toLowerCase().includes('fr')) ? 'fr' : 'en';
        const safeChat = escapeHtmlAttribute(row.chatId || '');
  // link to the prefixed DOM id used in the chat UI
  const prefixedId = id ? `interactionId${id}` : '';
  const hash = `#interaction=${encodeURIComponent(prefixedId)}`;
        // If we have a chatId, link to review page with chat + interaction hash, otherwise just show the id
        if (safeChat) return `<a href="/${chatLang}?chat=${safeChat}&review=1${hash}">${escapeHtmlAttribute(id)}</a>`;
        return escapeHtmlAttribute(id);
      }
    },
    { title: t('admin.evalDashboard.columns.department', 'Department'), data: 'department' },
    { title: t('admin.evalDashboard.columns.pageLanguage', 'Page'), data: 'pageLanguage', render: v => v ? escapeHtmlAttribute(v.toUpperCase()) : '' },
    { title: t('admin.evalDashboard.columns.autoEval', 'AutoEval'), data: 'hasAutoEval', render: v => v ? 'Yes' : 'No' },
    { title: t('admin.evalDashboard.columns.expertEval', 'ExpertEval'), data: 'hasExpertEval', render: v => v ? 'Yes' : 'No' },
    { title: t('admin.evalDashboard.columns.expertEmail', 'Expert Email'), data: 'expertEmail', render: v => v ? escapeHtmlAttribute(v) : '' },
    { title: t('admin.evalDashboard.columns.processed', 'Processed'), data: 'processed', render: v => v ? 'Yes' : 'No' },
    { title: t('admin.evalDashboard.columns.matches', 'Has matches'), data: 'hasMatches', render: v => v ? 'Yes' : 'No' },
    { title: t('admin.evalDashboard.columns.fallback', 'Fallback'), data: 'fallbackType' },
    { title: t('admin.evalDashboard.columns.reason', 'No-match reason'), data: 'noMatchReasonType' },
    { title: t('admin.evalDashboard.columns.date', 'Date'), data: 'date', render: (v) => formatDate(v) }
  ]), [formatDate, lang, t]);

  return (
    <GcdsContainer size="xl" mainContainer centered tag="main" className="mb-600">
      <h1 className="mb-400">{t('admin.evalDashboard.title', 'Evaluation dashboard')}</h1>

      <nav className="mb-400" aria-label={t('admin.navigation.ariaLabel', 'Admin Navigation')}>
        <GcdsText>
          <GcdsLink href={`/${lang}/admin`}>{t('common.backToAdmin', 'Back to Admin')}</GcdsLink>
        </GcdsText>
      </nav>

      <p className="mb-400">{t('admin.evalDashboard.description', 'Filter evaluations and explore details in the table below.')}</p>

  <FilterPanel onApplyFilters={(filters) => { handleApplyFilters(filters); }} onClearFilters={handleClearFilters} isVisible={true} storageKey={FILTER_PANEL_STORAGE_KEY} />

      {loading && (<div className="mt-400" role="status">{t('admin.evalDashboard.loading', 'Loading evaluations...')}</div>)}

      {error && (<div className="mt-400 error" role="alert">{t('admin.evalDashboard.error', 'Unable to load eval data.')} {String(error)}</div>)}

      <div className="mt-400">
        <div className="mb-200"><div>{resultsSummary}</div><div>{totalSummary}</div></div>
        {dataTableReady ? (
          <DataTable
            key={tableKey}
            columns={columns}
            options={{
              processing: true,
              serverSide: true,
              paging: true,
              searching: true,
              ordering: true,
              order: [[11, 'desc']],
              stateSave: true,
              language: {
                search: t('admin.evalDashboard.searchLabel', 'Search by Chat or Interaction ID:'),
                searchPlaceholder: t('admin.evalDashboard.searchPlaceholder', 'Enter id...')
              },
              stateSaveCallback: function (settings, data) {
                try { if (typeof window !== 'undefined' && window.localStorage) window.localStorage.setItem(LOCAL_TABLE_STORAGE_KEY, JSON.stringify(data)); } catch (e) { void e; }
              },
              stateLoadCallback: function () {
                try { if (typeof window !== 'undefined' && window.localStorage) return JSON.parse(window.localStorage.getItem(LOCAL_TABLE_STORAGE_KEY)); } catch (e) { void e; }
                return null;
              },
              ajax: async (dtParams, callback) => {
                try {
                  setLoading(true);
                  setError(null);
                  const dtOrder = Array.isArray(dtParams.order) && dtParams.order.length > 0 ? dtParams.order[0] : { column: 11, dir: 'desc' };
                  const orderByMap = ['chatId','interactionId','department','pageLanguage','hasAutoEval','hasExpertEval','expertEmail','processed','hasMatches','fallbackType','noMatchReasonType','createdAt'];
                  const orderBy = orderByMap[dtOrder.column] || 'createdAt';
                  const orderDir = dtOrder.dir || 'desc';
                  const searchValue = (dtParams.search && dtParams.search.value) || '';

                  const query = {
                    ...filtersRef.current,
                    start: dtParams.start || 0,
                    length: dtParams.length || 10,
                    orderBy,
                    orderDir,
                    draw: dtParams.draw || 0
                  };
                  if (searchValue) query.search = searchValue;

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
              initComplete: function () {
                try {
                  const api = this.api();
                  tableApiRef.current = api;
                  api.on('xhr.dt', function (_e, _settings, json) {
                    try { setRecordsTotal((json && json.recordsTotal) || 0); setRecordsFiltered((json && json.recordsFiltered) || 0); } catch (e) { /* ignore */ }
                  });
                } catch (e) { /* ignore */ }
              }
            }}
          />
        ) : (
          <div>Initializing table...</div>
        )}
      </div>
    </GcdsContainer>
  );
};

export default EvalDashboardPage;
