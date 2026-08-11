import React, { useState } from 'react';
import { GcdsButton } from '@gcds-core/components-react';
import DataTable from 'datatables.net-react';
import DT from 'datatables.net-dt';
import { useTranslations } from '../../hooks/useTranslations.js';
import { dataTableLanguage } from '../../utils/dataTableLanguage.js';
import VectorService from '../../services/VectorService.js';

DataTable.use(DT);

const SimilarChatsDashboard = ({ lang = 'en' }) => {
  const { t } = useTranslations(lang);
  const [chatId, setChatId] = useState('');
  const [chats, setChats] = useState([]);
  const [loading, setLoading] = useState(false);
  const [hasLoadedData, setHasLoadedData] = useState(false);

  const fetchSimilarChats = async () => {
    if (!chatId) return alert(t('vector.enterChatId'));
    setLoading(true);
    try {
      const data = await VectorService.getSimilarChats(chatId);
      if (data.success) {
        setChats(data.chats || []);
        setHasLoadedData(true);
      } else {
        alert(data.message || t('vector.fetchError'));
      }
    } catch (error) {
      alert(t('vector.fetchError') + ': ' + error.message);
    }
    setLoading(false);
  };

  return (
    <div className="space-y-6">
      <div className="bg-white shadow rounded-lg p-4">
        <label htmlFor="similar-chats-chat-id" className="sr-only">
          {t('vector.chatIdPlaceholder')}
        </label>
        <input
          id="similar-chats-chat-id"
          type="text"
          value={chatId}
          onChange={e => setChatId(e.target.value)}
          placeholder={t('vector.chatIdPlaceholder')}
          className="input input-bordered mr-2"
        />
        <GcdsButton
          onClick={fetchSimilarChats}
          disabled={loading}
          className="me-400 hydrated"
        >
          {loading ? t('vector.loadingSimilarChats') : t('vector.getSimilarChats')}
        </GcdsButton>
      </div>
      {hasLoadedData && (
        <div className="bg-white shadow rounded-lg p-4">
          <DataTable
            data={chats}
            columns={[
              {
                title: t('vector.columns.chatId'),
                data: 'chatId',
                // DataTables renders this as raw HTML, not JSX, so the React
                // <GcdsLink> wrapper can't be used — but the underlying
                // <gcds-link> custom element is just as usable in an HTML
                // string; it auto-upgrades once inserted regardless of how
                // it got into the DOM. Using it directly (rather than hand-
                // rolling the icon/rel/accessible-text it already adds for
                // target="_blank") keeps this in sync with GC DS for free.
                render: function(data) {
                  const url = `/${lang}?chat=${data}&review=1`;
                  return `<gcds-link href="${url}" target="_blank" lang="${lang}">${data}</gcds-link>`;
                }
              },
              { title: t('vector.columns.similarity'), data: 'similarity' },
              { title: t('vector.columns.aiProvider'), data: 'aiProvider' },
              { title: t('vector.columns.searchProvider'), data: 'searchProvider' },
              { title: t('vector.columns.pageLanguage'), data: 'pageLanguage' },
              { title: t('vector.columns.user'), data: 'user' },
            ]}
            options={{
              paging: true,
              searching: true,
              pageLength: 10,
              order: [[1, 'desc']],
              language: dataTableLanguage(lang),
            }}
          >
            <caption className="sr-only">{t('vector.similarChats')}</caption>
          </DataTable>
        </div>
      )}
    </div>
  );
};

export default SimilarChatsDashboard;
