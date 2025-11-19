import React, { useState } from 'react';
import { GcdsButton } from '@cdssnc/gcds-components-react';
import '../../styles/App.css';
import DataTable from 'datatables.net-react';
import DT from 'datatables.net-dt';
import { useTranslations } from '../../hooks/useTranslations.js';
import VectorService from '../../services/VectorService.js';

DataTable.use(DT);

const SimilarChatsDashboard = ({ lang = 'en' }) => {
  const { t } = useTranslations(lang);
  const [chatId, setChatId] = useState('');
  const [chats, setChats] = useState([]);
  const [loading, setLoading] = useState(false);
  const [hasLoadedData, setHasLoadedData] = useState(false);

  const fetchSimilarChats = async () => {
    if (!chatId) return alert('Please enter a chatId');
    setLoading(true);
    try {
      const data = await VectorService.getSimilarChats(chatId);
      if (data.success) {
        setChats(data.chats || []);
        setHasLoadedData(true);
      } else {
        alert(data.message || 'Failed to fetch similar chats');
      }
    } catch (error) {
      alert('Error fetching similar chats: ' + error.message);
    }
    setLoading(false);
  };

  return (
    <div className="space-y-6">
      <div className="bg-white shadow rounded-lg p-4">
        <input
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
                title: 'Chat ID',
                data: 'chatId',
                render: function(data) {
                  const url = `/${lang}?chat=${data}&review=1`;
                  return `<a href="${url}" target="_blank" rel="noopener noreferrer">${data}</a>`;
                }
              },
              { title: 'Similarity', data: 'similarity' },
              { title: 'AI Provider', data: 'aiProvider' },
              { title: 'Search Provider', data: 'searchProvider' },
              { title: 'Page Language', data: 'pageLanguage' },
              { title: 'User', data: 'user' },
            ]}
            options={{
              paging: true,
              searching: true,
              pageLength: 10,
              order: [[1, 'desc']],
            }}
          />
        </div>
      )}
    </div>
  );
};

export default SimilarChatsDashboard;
