import React, { useEffect, useState } from 'react';
import { GcdsContainer, GcdsText, GcdsLink } from '@cdssnc/gcds-components-react';
import DataTable from 'datatables.net-react';
import DT from 'datatables.net-dt';
import { useTranslations } from '../hooks/useTranslations.js';
import { usePageContext } from '../hooks/usePageParam.js';
import DataStoreService from '../services/DataStoreService.js';

DataTable.use(DT);

const PublicEvalPage = ({ lang: propLang }) => {
  const { language } = usePageContext();
  const lang = propLang || language || 'en';
  const { t } = useTranslations(lang);
  const [rows, setRows] = useState([]);

  useEffect(() => {
    DataStoreService.getPublicEvalList()
      .then(data => setRows(data.chats || []))
      .catch(err => console.error('Failed to load list', err));
  }, []);

  // Localized date formatter
  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    try {
      const date = new Date(dateStr);
      return new Intl.DateTimeFormat(lang === 'fr' ? 'fr-CA' : 'en-CA', {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
      }).format(date);
    } catch {
      return dateStr;
    }
  };

  return (
    <GcdsContainer size="xl" mainContainer centered tag="main" className="mb-600">
      <h1 className="mb-400">{t('admin.publicEval.title', 'Public Evaluation')}</h1>
      <nav className="mb-400" aria-label={t('admin.navigation.ariaLabel', 'Admin Navigation')}>
        <GcdsText>
          <GcdsLink href={`/${language}/admin`}>{t('common.backToAdmin', 'Back to Admin')}</GcdsLink>
        </GcdsText>
      </nav>
      <DataTable
        data={rows}
        columns={[
          {
            title: t('admin.publicEval.chatId', 'Chat ID'),
            data: 'chatId',
            render: (data) => `<a href="/${lang}?chat=${data}&review=1">${data}</a>`
          },
          { title: t('admin.publicEval.department', 'Department'), data: 'department' },
          {
            title: t('admin.publicEval.date', 'Date'),
            data: 'date',
            render: (data) => formatDate(data)
          }
        ]}
        options={{ paging: true, searching: true, ordering: true }}
      />
    </GcdsContainer>
  );
};

export default PublicEvalPage;
