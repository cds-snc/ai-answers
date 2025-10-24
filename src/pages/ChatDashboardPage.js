﻿import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GcdsContainer, GcdsText, GcdsLink } from '@cdssnc/gcds-components-react';
import DataTable from 'datatables.net-react';
import DT from 'datatables.net-dt';
import { useTranslations } from '../hooks/useTranslations.js';
import FilterPanel from '../components/admin/FilterPanel.js';
import DashboardService from '../services/DashboardService.js';

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

const TABLE_STORAGE_KEY = `chatDashboard_tableState_v1_`;

const ChatDashboardPage = ({ lang = 'en' }) => {
  const { t } = useTranslations(lang);
  const [rows, setRows] = useState([]); // retained for compatibility but unused in server-side mode
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [tableKey, setTableKey] = useState(0);
  const [dataTableReady, setDataTableReady] = useState(false);
  const [recordsTotal, setRecordsTotal] = useState(0);
  const [recordsFiltered, setRecordsFiltered] = useState(0);

  const tableApiRef = useRef(null);
  const filtersRef = useRef({});

  const LOCAL_TABLE_STORAGE_KEY = `${TABLE_STORAGE_KEY}${lang}`;
  const FILTER_PANEL_STORAGE_KEY = 'chatFilterPanelState_v1';

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

  // Map DataTables column index to API orderBy fields
  const orderByForColumn = useCallback((colIdx) => {
    switch (colIdx) {
      case 0: return 'chatId';
      case 1: return 'department';
      case 2: return 'expertEmail';
      case 3: return 'creatorEmail';
      case 4: return 'createdAt';
      default: return 'createdAt';
    }
  }, []);

  useEffect(() => {
    // On load, if we have a saved FilterPanel state, restore it to filtersRef
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

  // When user applies filters, fetch with those filters but keep any
  // existing table UI params (page/order/search). Only clear table params
  // when the user explicitly clears filters.
  const handleApplyFilters = useCallback((filters) => {
    filtersRef.current = filters || {};
    // trigger table reload if available
    try {
      if (tableApiRef.current) {
        tableApiRef.current.ajax.reload();
      } else {
        // if table not ready, force re-init
        setTableKey((prev) => prev + 1);
      }
    } catch (e) {
      // ignore
    }
  }, []);

  const handleClearFilters = useCallback(() => {
    // Clear saved table state so the DataTable resets to defaults.
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        // remove both the per-lang key and the base key for backwards compat
        try { window.localStorage.removeItem(LOCAL_TABLE_STORAGE_KEY); } catch (e) { void e; }
        try { window.localStorage.removeItem(TABLE_STORAGE_KEY); } catch (e) { void e; }
        console.debug && console.debug('ChatDashboard: cleared local table storage', LOCAL_TABLE_STORAGE_KEY, TABLE_STORAGE_KEY);
      }
    } catch (e) {
      void e;
    }
    // force DataTable re-init so restored state is reset
    setTableKey((prev) => prev + 1);
    filtersRef.current = {};
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
        // Use the chat's original pageLanguage, fallback to 'en' if not available
        const chatLang = row.pageLanguage && (row.pageLanguage.toLowerCase().includes('fr')) ? 'fr' : 'en';
        return `<a href="/${chatLang}?chat=${safeId}&review=1">${safeId}</a>`;
      }
    },
    {
      title: t('admin.chatDashboard.columns.department', 'Department'),
      data: 'department'
    },
    {
      title: t('admin.chatDashboard.columns.pageLanguage', 'Page'),
      data: 'pageLanguage',
      render: (value) => {
        if (!value) return '';
        // Display just 'en' or 'fr' in uppercase for readability
        const normalized = value.toLowerCase().includes('fr') ? 'FR' : 'EN';
        return escapeHtmlAttribute(normalized);
      }
    },
    {
      title: t('admin.chatDashboard.columns.expertEmail', 'Expert email'),
      data: 'expertEmail',
      render: (value) => {
        // Only show expert email (from expertFeedback), no fallback to creatorEmail
        return escapeHtmlAttribute(value || '');
      }
    },
    {
      title: t('admin.chatDashboard.columns.creatorEmail', 'Creator email'),
      data: 'creatorEmail',
      render: (value) => {
        // Only show creator email (chat.user), no fallback to expertEmail
        return escapeHtmlAttribute(value || '');
      }
    },
    {
      title: t('admin.chatDashboard.columns.date', 'Date'),
      data: 'date',
      render: (value) => formatDate(value)
    }
  ]), [formatDate, lang, t]);

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

      <p className="mb-400">
        {t('admin.chatDashboard.description', 'Filter chat interactions and explore details in the table below.')}
      </p>

      <FilterPanel
        onApplyFilters={(filters) => { handleApplyFilters(filters); }}
        onClearFilters={handleClearFilters}
        isVisible={true}
      />

      {loading && (
        <div className="mt-400" role="status">
          {t('admin.chatDashboard.loading', 'Loading chats...')}
        </div>
      )}

      {error && (
        <div className="mt-400 error" role="alert">
          {t('admin.chatDashboard.error', 'Unable to load chat data.')} {String(error)}
        </div>
      )}

      {!loading && !error && (
        <div className="mt-400">
          {/* A hint is shown regardless; DataTables server-side will handle empty states */}
          {t('admin.chatDashboard.noResults', 'Apply filters to load chat interactions.')}
        </div>
      )}

      <div className="mt-400">
        <div className="mb-200">
          <div>{resultsSummary}</div>
          <div>{totalSummary}</div>
        </div>
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
              order: [[4, 'desc']], // default to date desc
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
              stateLoadCallback: function (settings) {
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
                  const dtOrder = Array.isArray(dtParams.order) && dtParams.order.length > 0 ? dtParams.order[0] : { column: 4, dir: 'desc' };
                  const orderBy = orderByForColumn(dtOrder.column);
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
                  // Update counts after each xhr
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
        ) : (
          <div>Initializing table...</div>
        )}
      </div>
    </GcdsContainer>
  );
};

export default ChatDashboardPage;
