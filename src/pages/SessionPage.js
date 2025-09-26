import React, { useState, useEffect } from 'react';
import { GcdsContainer, GcdsText, GcdsLink } from '@cdssnc/gcds-components-react';
import DataTable from 'datatables.net-react';
import DT from 'datatables.net-dt';
import { useTranslations } from '../hooks/useTranslations.js';
import { usePageContext } from '../hooks/usePageParam.js';
import SessionService from '../services/SessionService.js';

DataTable.use(DT);

const SessionPage = ({ lang: propLang }) => {
  const { language } = usePageContext();
  const lang = propLang || language || 'en';
  const { t } = useTranslations(lang);
  const [sessions, setSessions] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const fetchSessions = async () => {
    setLoading(true);
    setError('');
    try {
      const sess = await SessionService.getSessionMetrics();
      setSessions(sess);
    } catch (e) {
      // prefer admin.session.errorLoading if status/text available
      if (e && e.status) {
        setError(t('admin.session.errorLoading', 'Failed to load sessions: {status} {text}', { status: e.status, text: e.text || '' }));
      } else {
        setError(t('admin.session.errorGeneric', 'Error: {message}', { message: e.message }));
      }
      setSessions([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSessions();
    const iv = setInterval(fetchSessions, 5000);
    return () => clearInterval(iv);
  }, []);

  return (
    <GcdsContainer size="xl" mainContainer centered tag="main" className="mb-600">
  <h1 className="mb-400">{t('admin.session.title', 'Sessions')}</h1>
      <nav className="mb-400" aria-label={t('admin.navigation.ariaLabel', 'Admin Navigation')}>
        <GcdsText>
          <GcdsLink href={`/${lang}/admin`}>{t('common.backToAdmin', 'Back to Admin')}</GcdsLink>
        </GcdsText>
      </nav>

  {error && <div style={{ color: 'red' }}>{error}</div>}
  {loading && <div>{t('admin.filters.loading', 'Loading...')}</div>}

      <DataTable
        data={sessions}
        columns={[
          { title: t('admin.session.chatId', 'Chat ID'), data: 'chatId', render: (data) => `<a href="/${lang}?chat=${data}&review=1">${data}</a>` },
          { title: t('admin.session.lastSeen', 'Last seen'), data: 'lastSeen', render: (data) => new Date(data).toLocaleString() },
          { title: t('admin.session.requests', 'Requests'), data: 'requestCount' },
          { title: t('admin.session.errors', 'Errors'), data: 'errorCount' },
          // specific error type columns
          { title: t('admin.session.errorTypes.redaction', 'Redactions'), data: 'errorTypes', render: (data) => (data && data.redaction) ? data.redaction : 0 },
          { title: t('admin.session.errorTypes.shortQuery', 'Short queries'), data: 'errorTypes', render: (data) => (data && data.shortQuery) ? data.shortQuery : 0 },
          // aggregated "other" errors column
          { title: t('admin.session.errorTypes.other', 'Other errors'), data: 'errorTypesOther' },
          { title: t('admin.session.lastLatency', 'Last latency (ms)'), data: 'lastLatencyMs' },
          { title: t('admin.session.avgLatency', 'Avg latency (ms)'), data: 'avgLatencyMs' },
          { title: t('admin.session.rpm', 'Requests / minute'), data: 'rpm' }
        ]}
        options={{ paging: true, searching: true, ordering: true }}
      />
    </GcdsContainer>
  );
};

export default SessionPage;
