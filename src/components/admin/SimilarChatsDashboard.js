import React, { useEffect, useRef, useState } from 'react';
import DataTable from 'datatables.net-react';
import DT from 'datatables.net-dt';
import { useTranslations } from '../../hooks/useTranslations.js';
import { dataTableLanguage } from '../../utils/dataTableLanguage.js';
import { setColumnHeaderScope } from '../../utils/admin/dataTableAccessibility.js';
import VectorService from '../../services/VectorService.js';
import { buildChatReviewLinkHtml, chatLangFromPageLanguage } from '../../utils/reviewLink.js';
import { escapeHtml } from '../../utils/htmlEscape.js';
import ChatIdLookupField from './ChatIdLookupField.js';
import StatusMessage from './StatusMessage.js';
import { buildChatIdMatchesLabels } from './ChatIdMatchList.js';
import { useChatIdLookup } from '../../hooks/admin/useChatIdLookup.js';
import { useErrorStatus } from '../../hooks/useErrorStatus.js';

DataTable.use(DT);

// describedById: the page's own section heading, so this field's plain
// "Chat ID" name gets its section as context (see ChatIdLookupField.js).
const SimilarChatsDashboard = ({ lang = 'en', describedById }) => {
  const { t } = useTranslations(lang);
  const { buildErrorStatus, renderStatusMessage } = useErrorStatus(t);
  const [chats, setChats] = useState([]);
  const [loading, setLoading] = useState(false);
  const [hasLoadedData, setHasLoadedData] = useState(false);
  // Partial or full chat ID, same search as the admin home page's View
  // chat by ID: validation, "not found" and the several-matches pick list.
  const lookupChat = useChatIdLookup({ lang });
  // Was window.alert() for both branches below — never caught by the
  // earlier StatusMessage migration pass since it was never StatusMessage
  // to begin with.
  const [fetchMessage, setFetchMessage] = useState(null);
  // Picking a match removes the pick-list, and the button with it - move
  // focus to the results table instead of letting it drop to <body>.
  // DataTables owns the <table>, so it's found and made focusable here. A
  // failed pick has no table: focus its outcome message (the
  // trigger-loses-focus case in status-and-error-messaging.md), the field
  // only if there's neither. fromPick: the same boxes show typed-search
  // outcomes, which still announce normally.
  const [pickFocusCount, setPickFocusCount] = useState(0);
  const [fromPick, setFromPick] = useState(false);
  const tableContainerRef = useRef(null);
  const fetchMessageRef = useRef(null);
  const lookupStatusRef = useRef(null);
  useEffect(() => {
    if (!pickFocusCount) return;
    const table = tableContainerRef.current?.querySelector('table');
    if (!table) {
      (fetchMessageRef.current
        || lookupStatusRef.current
        || document.getElementById('similar-chats-chat-id'))?.focus();
      return;
    }
    table.setAttribute('tabindex', '-1');
    table.classList.add('focus-target');
    table.focus();
  }, [pickFocusCount]);

  const fetchSimilarChats = async (chatId) => {
    setLoading(true);
    try {
      const data = await VectorService.getSimilarChats(chatId);
      if (data.success) {
        setChats(data.chats || []);
        setHasLoadedData(true);
      } else if (data.message) {
        // data.message is raw, untranslated server text — never run it
        // through the {error} template as a plain string substitution (a FR
        // admin would otherwise hear it in French). renderStatusMessage
        // already wraps `detail` in lang="en" — don't wrap it again here.
        setFetchMessage(buildErrorStatus('vector.fetchErrorDetail', { message: data.message }));
      } else {
        setFetchMessage({ isError: true, text: t('vector.fetchError') });
      }
    } catch (error) {
      setFetchMessage(buildErrorStatus('vector.fetchErrorDetail', error));
    }
    setLoading(false);
  };

  // searchChats/selectMatch leave loading on for a confirmed chat (see
  // useChatIdLookup.js); fetching similar chats is that next step.
  const handleSubmit = async (e) => {
    e.preventDefault();
    setFromPick(false);
    setFetchMessage(null);
    // Same as the metadata lookup: a new search clears the last chat's
    // results, so they can't sit under this search's "No chat found".
    setChats([]);
    setHasLoadedData(false);
    const chat = await lookupChat.searchChats(lookupChat.chatId);
    if (!chat) return;
    lookupChat.setLoading(false);
    fetchSimilarChats(chat.chatId);
  };

  const handleSelectMatch = async (matchId) => {
    setFromPick(true);
    const chat = await lookupChat.selectMatch(matchId);
    if (chat) {
      lookupChat.setLoading(false);
      await fetchSimilarChats(chat.chatId);
    }
    setPickFocusCount((n) => n + 1);
  };

  return (
    <div>
      {/* Same field as the admin home page's chat ID lookup. */}
      <form className="mb-200" onSubmit={handleSubmit}>
        <ChatIdLookupField
          fieldId="similar-chats-chat-id"
          label={t('vector.chatIdLabel')}
          placeholder={t('admin.common.chatIdSearchPlaceholder')}
          value={lookupChat.chatId}
          onChange={e => {
            lookupChat.handleInputChange(e);
            setFetchMessage(null);
          }}
          disabled={lookupChat.loading || loading}
          hasError={lookupChat.hasError}
          errorMessage={lookupChat.inlineErrorMessage}
          errorCount={lookupChat.errorCount}
          errorRef={lookupChat.errorRef}
          buttonLabel={lookupChat.loading || loading ? t('vector.loadingSimilarChats') : t('vector.getSimilarChats')}
          describedById={describedById}
          matches={lookupChat.matches}
          {...buildChatIdMatchesLabels(t, lookupChat.matches, lookupChat.matchesTruncated)}
          onSelectMatch={handleSelectMatch}
        />
      </form>
      {/* "No chat found" (info) or a failed search (error), from the shared search. */}
      {/* Focused, not announced, after a failed pick - see fromPick. */}
      <StatusMessage
        ref={lookupStatusRef}
        tabIndex={-1}
        className="focus-target"
        announce={!(fromPick && lookupChat.status)}
        announcedVia={fromPick && lookupChat.status ? 'focus' : undefined}
        variant={lookupChat.status?.variant}
        message={lookupChat.status?.text}
        nonce={lookupChat.statusNonce}
      />
      {renderStatusMessage(fetchMessage, 'success', 'fetch', {
        ref: fetchMessageRef,
        tabIndex: -1,
        className: 'focus-target',
        announce: !(fromPick && fetchMessage),
        announcedVia: fromPick && fetchMessage ? 'focus' : undefined,
      })}
      {hasLoadedData && (
        <div className="metrics-table-container" ref={tableContainerRef}>
          <DataTable
            data={chats}
            className="display dashboard-table zebra-stable-on-hover"
            columns={[
              {
                title: t('vector.columns.chatId'),
                data: 'chatId',
                // Route to the chat's own pageLanguage (already shown in the
                // adjacent Page language column below), not this dashboard's
                // own current UI language - see the same note in
                // ChatDashboardPage.js. The admin's own language rides along
                // separately as the adminLang query param (4th arg).
                render: (data, type, row) => buildChatReviewLinkHtml(data, chatLangFromPageLanguage(row.pageLanguage), null, lang)
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
              // Same zones as the other admin tables: filter box top-left,
              // page info + entries-per-page bottom-left, paging bottom-right.
              layout: {
                topStart: 'search',
                topEnd: {},
                bottomStart: { features: ['pageLength', 'info'] },
                bottomEnd: { paging: { firstLast: false } },
              },
              language: {
                ...dataTableLanguage(lang),
                // Filter-style box: sr-only label, "Filter" placeholder,
                // native x to clear (no search-term pill).
                search: `<span class="sr-only">${escapeHtml(t('vector.similarChatsFilterLabel'))}</span>`,
                searchPlaceholder: t('admin.common.filterPlaceholder'),
              },
              initComplete: function () {
                setColumnHeaderScope(this.api());
              },
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
