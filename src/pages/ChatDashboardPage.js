import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [tableKey, setTableKey] = useState(0);

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

  const fetchChats = useCallback(async (filters = {}) => {
    setLoading(true);
    setError(null);
    try {
      const data = await DashboardService.getChatDashboard(filters || {});
      const chatRows = Array.isArray(data?.chats) ? data.chats : [];
      setRows(chatRows);
      setTableKey((prev) => prev + 1);
    } catch (err) {
      console.error('Failed to load chat dashboard data', err);
      setRows([]);
      setError(err.message || String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // On load, if we have a saved FilterPanel state, auto-apply it so the
    // page reflects the last user selection. Otherwise fetch defaults.
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const raw = window.localStorage.getItem(FILTER_PANEL_STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          // Build filters in the same shape FilterPanel sends on Apply
          const filters = {};
          if (parsed) {
            if (parsed.department) filters.department = parsed.department;
            if (parsed.referringUrl) filters.referringUrl = parsed.referringUrl;
            if (parsed.filterType) {
              filters.filterType = parsed.filterType;
              if (parsed.filterType === 'preset') {
                filters.presetValue = parsed.presetValue;
                if (parsed.presetValue !== 'all' && parsed.dateRange) {
                  // convert stored local datetime-local strings to ISO if present
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
          // Use saved filters to fetch chats and reflect the UI
          fetchChats(filters);
          return;
        }
      }
    } catch (e) {
      // fall back to default fetch
    }
    fetchChats({});
  }, [fetchChats]);

  // When user applies filters, fetch with those filters but keep any
  // existing table UI params (page/order/search). Only clear table params
  // when the user explicitly clears filters.
  const handleApplyFilters = useCallback((filters) => {
    fetchChats(filters || {});
  }, [fetchChats]);

  const handleClearFilters = useCallback(() => {
    // Clear saved table state so the DataTable resets to defaults.
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem(LOCAL_TABLE_STORAGE_KEY);
      }
    } catch (e) {
      // ignore
    }
    // force DataTable re-init so restored state is reset
    setTableKey((prev) => prev + 1);
    fetchChats({});
  }, [fetchChats]);

  const resultsSummary = useMemo(() => {
    const template = t('admin.chatDashboard.resultsSummary', 'Showing {count} chats');
    return template.replace('{count}', numberFormatter.format(rows.length));
  }, [numberFormatter, rows.length, t]);

  const totalSummary = useMemo(() => {
    const template = t('admin.chatDashboard.totalCount', 'Total matching chats: {total}');
    return template.replace('{total}', numberFormatter.format(rows.length));
  }, [numberFormatter, rows.length, t]);

  const columns = useMemo(() => ([
    {
      title: t('admin.chatDashboard.columns.chatId', 'Chat ID'),
      data: 'chatId',
      render: (value) => {
        if (!value) return '';
        const safeId = escapeHtmlAttribute(value);
        return `<a href="/${lang}?chat=${safeId}&review=1">${safeId}</a>`;
      }
    },
    {
      title: t('admin.chatDashboard.columns.department', 'Department'),
      data: 'department'
    },
    {
      title: t('admin.chatDashboard.columns.expertEmail', 'Expert email'),
      data: 'expertEmail',
      render: (value) => escapeHtmlAttribute(value || '')
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

      {!loading && !error && rows.length === 0 && (
        <div className="mt-400">
          {t('admin.chatDashboard.noResults', 'Apply filters to load chat interactions.')}
        </div>
      )}

      {rows.length > 0 && (
        <div className="mt-400">
          <div className="mb-200">
            <div>{resultsSummary}</div>
            <div>{totalSummary}</div>
          </div>
          <DataTable
            key={tableKey}
            data={rows}
            columns={columns}
            options={{
              paging: true,
              searching: true,
              ordering: true,
              // Restore table state (order, page, length, search) from localStorage
              stateSave: false,
              order: (function() {
                try {
              if (typeof window === 'undefined' || !window.localStorage) return [[2, 'desc']];
                  const raw = window.localStorage.getItem(LOCAL_TABLE_STORAGE_KEY);
                  if (!raw) return [[2, 'desc']];
                  const parsed = JSON.parse(raw);
                  if (!parsed) return [[2, 'desc']];
                  // parsed may be object { order, page, length, search }
                  if (Array.isArray(parsed.order) && parsed.order.length === 2) return [parsed.order];
                  // Backwards compat: previously stored an array [col, dir]
                  if (Array.isArray(parsed) && parsed.length === 2) return [parsed];
                } catch (err) {
                  // ignore
                }
                return [[2, 'desc']];
              })(),
              // parameters provided by DataTables but intentionally unused
              // eslint-disable-next-line no-unused-vars
              initComplete: function(_settings, _json) {
                try {
                  const table = this.api();

                  // Restore page, length, and search if stored
                  try {
                    if (typeof window !== 'undefined' && window.localStorage) {
                      const raw = window.localStorage.getItem(LOCAL_TABLE_STORAGE_KEY);
                      if (raw) {
                        const parsed = JSON.parse(raw);
                        if (parsed) {
                          if (typeof parsed.length === 'number') {
                            table.page.len(parsed.length);
                          }
                          if (typeof parsed.search === 'string' && parsed.search.length) {
                            table.search(parsed.search).draw(false);
                          }
                          if (typeof parsed.page === 'number') {
                            table.page(parsed.page).draw(false);
                          }
                        }
                      }
                    }
                  } catch (e) {
                    // ignore restore errors
                  }

                  // Save full table state on relevant changes
                  const saveState = () => {
                    try {
                      if (typeof window === 'undefined' || !window.localStorage) return;
                      const st = {
                        order: (() => { const o = table.order(); return Array.isArray(o[0]) ? o[0] : o; })(),
                        page: table.page(),
                        length: table.page.len(),
                        search: table.search() || ''
                      };
                      window.localStorage.setItem(LOCAL_TABLE_STORAGE_KEY, JSON.stringify(st));
                    } catch (err) {
                      // ignore
                    }
                  };

                  table.on('order.dt', saveState);
                  table.on('page.dt', saveState);
                  table.on('length.dt', saveState);
                  table.on('search.dt', () => setTimeout(saveState, 0));
                } catch (e) {
                  // ignore
                }
              }
            }}
          />
        </div>
      )}
    </GcdsContainer>
  );
};

export default ChatDashboardPage;
