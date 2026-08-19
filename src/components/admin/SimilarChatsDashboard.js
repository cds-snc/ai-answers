import React, { useState } from 'react';
import { GcdsButton } from '@gcds-core/components-react';
import DataTable from 'datatables.net-react';
import DT from 'datatables.net-dt';
import { useTranslations } from '../../hooks/useTranslations.js';
import { dataTableLanguage } from '../../utils/dataTableLanguage.js';
import VectorService from '../../services/VectorService.js';
import { buildChatReviewLinkHtml } from '../../utils/reviewLink.js';
import StatusMessage from './StatusMessage.js';
import FeedbackInlineError from '../chat/FeedbackInlineError.js';
import { useInlineFormError } from '../../hooks/useInlineFormError.js';

DataTable.use(DT);

const SimilarChatsDashboard = ({ lang = 'en' }) => {
  const { t } = useTranslations(lang);
  const [chatId, setChatId] = useState('');
  const [chats, setChats] = useState([]);
  const [loading, setLoading] = useState(false);
  const [hasLoadedData, setHasLoadedData] = useState(false);
  // Field-tied validation ("enter a chat ID"), not a page-level outcome —
  // FeedbackInlineError + aria-describedby, matching VectorPage.js's
  // metadata lookup pattern (see AGENTS.md's "StatusMessage vs. form-field
  // errors"). useInlineFormError (not plain useState) so errorCount
  // increments on every triggerError(), forcing FeedbackInlineError's
  // key={errorCount} to mount a fresh node and re-announce even a repeat
  // identical failure — see AGENTS.md's FeedbackInlineError reuse note.
  const {
    hasError: hasChatIdError,
    errorCount: chatIdErrorCount,
    errorRef: chatIdErrorRef,
    triggerError: triggerChatIdError,
    clearError: clearChatIdError,
  } = useInlineFormError();
  // Was window.alert() for both branches below — never caught by the
  // earlier StatusMessage migration pass since it was never StatusMessage
  // to begin with.
  const [fetchMessage, setFetchMessage] = useState(null);

  const fetchSimilarChats = async () => {
    if (!chatId) {
      triggerChatIdError();
      return;
    }
    clearChatIdError();
    setFetchMessage(null);
    setLoading(true);
    try {
      const data = await VectorService.getSimilarChats(chatId);
      if (data.success) {
        setChats(data.chats || []);
        setHasLoadedData(true);
      } else if (data.message) {
        // data.message is raw, untranslated server text — never run it
        // through the {message} template as a plain string substitution (a
        // FR admin would otherwise hear it announced as French). Split the
        // translated template around the placeholder instead, so the detail
        // can be wrapped in its own lang="en" span (mirrors
        // DeleteChatSection.js).
        const [prefix, suffix] = t('vector.fetchErrorDetail').split('{message}');
        setFetchMessage({ prefix, suffix, detail: <span lang="en">{data.message}</span> });
      } else {
        setFetchMessage({ prefix: t('vector.fetchError'), suffix: '', detail: null });
      }
    } catch (error) {
      const [prefix, suffix] = t('vector.fetchErrorDetail').split('{message}');
      setFetchMessage({ prefix, suffix, detail: <span lang="en">{error.message || String(error)}</span> });
    }
    setLoading(false);
  };

  return (
    <div className="space-y-6">
      <div className="bg-white shadow rounded-lg p-4">
        <label htmlFor="similar-chats-chat-id" className="sr-only">
          {t('vector.chatIdPlaceholder')}
        </label>
        {hasChatIdError && (
          <FeedbackInlineError
            id="similar-chats-chat-id-error"
            message={t('vector.enterChatId')}
            errorCount={chatIdErrorCount}
            inputRef={chatIdErrorRef}
          />
        )}
        <input
          id="similar-chats-chat-id"
          type="text"
          value={chatId}
          onChange={e => {
            setChatId(e.target.value);
            clearChatIdError();
            setFetchMessage(null);
          }}
          placeholder={t('vector.chatIdPlaceholder')}
          aria-describedby={hasChatIdError ? 'similar-chats-chat-id-error' : undefined}
          className="input input-bordered mr-2"
        />
        <GcdsButton
          onClick={fetchSimilarChats}
          disabled={loading}
          className="me-400 hydrated"
        >
          {loading ? t('vector.loadingSimilarChats') : t('vector.getSimilarChats')}
        </GcdsButton>
        {fetchMessage && (
          <StatusMessage variant="error">
            {fetchMessage.prefix}{fetchMessage.detail}{fetchMessage.suffix}
          </StatusMessage>
        )}
      </div>
      {hasLoadedData && (
        <div className="bg-white shadow rounded-lg p-4">
          <DataTable
            data={chats}
            columns={[
              {
                title: t('vector.columns.chatId'),
                data: 'chatId',
                render: (data) => buildChatReviewLinkHtml(data, lang)
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
