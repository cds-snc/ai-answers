import React, { useState } from 'react';
import { GcdsContainer, GcdsText, GcdsLink } from '@gcds-core/components-react';
import DataTable from 'datatables.net-react';
import DT from 'datatables.net-dt';
import { useTranslations } from '../hooks/useTranslations.js';
import { usePausablePolling } from '../hooks/usePauseToggle.js';
import PauseToggleButton from '../components/admin/PauseToggleButton.js';
import { dataTableLanguage } from '../utils/dataTableLanguage.js';
import { setColumnHeaderScope } from '../utils/admin/dataTableAccessibility.js';
import { escapeHtml } from '../utils/htmlEscape.js';
import { usePageContext } from '../hooks/usePageParam.js';
import SessionService from '../services/SessionService.js';
import StatusMessage from '../components/admin/StatusMessage.js';
import { useErrorStatus } from '../hooks/useErrorStatus.js';

DataTable.use(DT);

const SessionPage = ({ lang: propLang }) => {
  const { language } = usePageContext();
  const lang = propLang || language || 'en';
  const { t } = useTranslations(lang);
  const { buildErrorStatus, renderStatusMessage } = useErrorStatus(t);
  const [sessions, setSessions] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const sessionTypeLabel = React.useCallback((value) => {
    const type = value || 'unknown';
    const labels = {
      auth: t('admin.session.sessionTypes.auth'),
      visitor: t('admin.session.sessionTypes.visitor'),
      session: t('admin.session.sessionTypes.session'),
      ip: t('admin.session.sessionTypes.ip'),
      unknown: t('admin.session.sessionTypes.unknown'),
    };
    return labels[type] || labels.unknown;
  }, [t]);
  const creditsLeftLabel = React.useCallback((value) => (
    value === null ? t('admin.session.unlimited') : (value !== undefined ? value : 0)
  ), [t]);

  const fetchSessions = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const sess = await SessionService.getSessionMetrics();
      // Ensure creditsLeft reflects the session-level value (shared across
      // multiple chatIds) while preserving chat-specific metrics for the
      // other columns. Build a lookup of sessionId -> creditsLeft and
      // normalize the returned rows to use that value.
      const sessionCredits = {};
      for (const row of sess || []) {
        if (row && typeof row.sessionId !== 'undefined' && typeof row.creditsLeft !== 'undefined') {
          if (typeof sessionCredits[row.sessionId] === 'undefined') sessionCredits[row.sessionId] = row.creditsLeft;
        }
      }
      const normalized = (sess || []).map(r => ({ ...r, creditsLeft: sessionCredits[r.sessionId] ?? r.creditsLeft }));
      setSessions(normalized);
    } catch (e) {
      setError(buildErrorStatus('admin.session.errorLoading', e));
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }, [buildErrorStatus]);

  // WCAG 2.2.2 (Pause, Stop, Hide): the 5s poll below keeps refreshing the
  // table.
  const { isPaused, togglePause } = usePausablePolling(fetchSessions, 5000, [fetchSessions]);

  return (
    <GcdsContainer layout="page" className="mb-600">
      <h1 className="mb-400">{t('admin.session.title')}</h1>
      <nav className="mb-400" aria-label={t('admin.navigation.ariaLabel')}>
        <GcdsText>
          <GcdsLink href={`/${lang}/admin`}>{t('common.backToAdmin')}</GcdsLink>
        </GcdsText>
      </nav>

      {renderStatusMessage(error)}
      {loading && <StatusMessage loading message={t('admin.filters.loading')} />}

      <PauseToggleButton isPaused={isPaused} onToggle={togglePause} t={t} className="mb-200" />

      <div className="metrics-table-container">
      <DataTable
        data={sessions}
        className="display dashboard-table zebra-stable-on-hover"
        columns={[
          { title: t('admin.session.sessionId'), data: 'sessionId', render: (data) => data || '' },
          { title: t('admin.session.sessionType'), data: 'sessionType', render: (data) => sessionTypeLabel(data) },
          {
            title: t('admin.session.chatId'), data: 'chatId', render: (data, type, row) => {
              const cid = data || row.chatId || '';
              return cid ? `<a href="/${lang}?chat=${cid}&review=1">${cid}</a>` : '';
            }
          },
          { title: t('admin.session.creditsLeft'), data: 'creditsLeft', render: (data) => creditsLeftLabel(data) },
          { title: t('admin.session.lastSeen'), data: 'lastSeen', render: (data) => new Date(data).toLocaleString() },
          { title: t('admin.session.requests'), data: 'requestCount' },
          { title: t('admin.session.errors'), data: 'errorCount' },
          // specific error type columns
          { title: t('admin.session.errorTypes.redaction'), data: 'errorTypes', render: (data) => (data && data.redaction) ? data.redaction : 0 },
          { title: t('admin.session.errorTypes.shortQuery'), data: 'errorTypes', render: (data) => (data && data.shortQuery) ? data.shortQuery : 0 },
          // aggregated "other" errors column
          { title: t('admin.session.errorTypes.other'), data: 'errorTypesOther' },
          { title: t('admin.session.lastLatency'), data: 'lastLatencyMs' },
          { title: t('admin.session.avgLatency'), data: 'avgLatencyMs' },
          { title: t('admin.session.rpm'), data: 'rpm' }
        ]}
        options={{
          paging: true,
          searching: true,
          ordering: true,
          // Same zones as the dashboards: filter box top-left, page info +
          // entries-per-page bottom-left, paging bottom-right.
          layout: {
            topStart: 'search',
            topEnd: {},
            bottomStart: { features: ['pageLength', 'info'] },
            bottomEnd: { paging: { firstLast: false } },
          },
          language: {
            ...dataTableLanguage(lang),
            // Filter-style box like the other admin tables: sr-only label,
            // "Filter" placeholder, native x to clear.
            search: `<span class="sr-only">${escapeHtml(t('admin.session.filterLabel'))}</span>`,
            searchPlaceholder: t('admin.common.filterPlaceholder'),
          },
          initComplete: function () {
            setColumnHeaderScope(this.api());
          },
        }}
      >
        <caption className="sr-only">{t('admin.session.title')}</caption>
      </DataTable>
      </div>
    </GcdsContainer>
  );
};

export default SessionPage;
