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

const ChatDashboardPage = ({ lang = 'en' }) => {
  const { t } = useTranslations(lang);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [tableKey, setTableKey] = useState(0);

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
    fetchChats({});
  }, [fetchChats]);

  const handleApplyFilters = useCallback((filters) => {
    fetchChats(filters || {});
  }, [fetchChats]);

  const handleClearFilters = useCallback(() => {
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
        onApplyFilters={handleApplyFilters}
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
            options={{ paging: true, searching: true, ordering: true }}
          />
        </div>
      )}
    </GcdsContainer>
  );
};

export default ChatDashboardPage;
