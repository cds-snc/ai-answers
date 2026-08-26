import React from 'react';
import { useNavigate } from 'react-router-dom';
import StatusMessage from './StatusMessage.js';
import ChatIdLookupField from './ChatIdLookupField.js';
import { buildChatIdMatchesLabels } from './ChatIdMatchList.js';
import { useChatIdLookup } from '../../hooks/admin/useChatIdLookup.js';

// Chat-ID lookup, navigating to the chat viewer for whichever chat is
// confirmed. Accepts a partial ID as well as a full one — see
// useChatIdLookup.js's searchChats: a full-UUID-shaped value resolves
// directly (unchanged from this component's original exact-only
// behaviour), a partial fragment that matches exactly one chat resolves the
// same way, and a fragment matching several leaves ChatIdLookupField's own
// pick-list up for the admin to choose from (handleSelectMatch below
// navigates once they do). EvalDashboardPage.js has its own, unrelated
// "View chat by ID" search (EvaluationService.getEvalDashboard, not
// db-chat-search.js/useChatIdLookup.js) — only its label/placeholder locale
// strings are actually shared with this one, not the search logic itself.
//
// Checks the chat actually exists (via useChatIdLookup.js's shared
// existence check, the same DataStoreService.getChat / db-chat.js route
// DeleteByChatIdSection.js uses) before navigating. Previously this
// navigated on any non-empty input, no matter the ID's validity — a wrong
// or partial ID silently landed on an empty review page with no
// explanation, instead of telling the admin the lookup failed. Doesn't go
// through DeleteByChatIdSection.js itself, even though the pre-navigation
// checks are identical: viewing isn't destructive, so it shouldn't trigger
// that component's delete-style window.confirm() step — only the shared
// hook is reused, not the whole component.
//
// One row in whichever page renders it (its own h2) - collapsed by
// default, summary text is this row's only label, no separate heading
// here - same shape as DeleteChatSection.js/DeleteExpertEval.js. Pulled
// out of AdminPage.js so it can be reused on other pages without
// duplicating the lookup form itself.
const ViewChatByIdSection = ({ lang = 'en' }) => {
  const navigate = useNavigate();
  const {
    t,
    chatId,
    handleInputChange,
    handleToggle,
    loading,
    status,
    hasError,
    errorCount,
    errorRef,
    inlineErrorMessage,
    matches,
    matchesTruncated,
    searchChats,
    selectMatch,
  } = useChatIdLookup({ lang });

  // Shared by both ways a chat can get confirmed below - a direct search
  // that resolves to exactly one match, or picking one out of several.
  // No setLoading(false)/reset on success in either path — this component
  // is about to unmount as the page navigates away.
  const goToChat = (chat) => {
    if (!chat) return;
    navigate(`/${lang}?chat=${encodeURIComponent(chat.chatId)}&review=1`);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    goToChat(await searchChats(chatId));
  };

  const handleSelectMatch = async (selectedChatId) => {
    goToChat(await selectMatch(selectedChatId));
  };

  return (
    <details onToggle={handleToggle}>
      <summary id="view-chat-id-summary">{t('admin.common.viewChatById')}</summary>
      <div className="mt-200">
        <form onSubmit={handleSubmit}>
          <ChatIdLookupField
            fieldId="view-chat-id"
            label={t('admin.viewChat.label')}
            placeholder={t('admin.common.chatIdSearchPlaceholder')}
            value={chatId}
            onChange={handleInputChange}
            disabled={loading}
            hasError={hasError}
            errorMessage={inlineErrorMessage}
            errorCount={errorCount}
            errorRef={errorRef}
            buttonLabel={loading ? t('admin.viewChat.loading') : t('admin.common.chatIdSearchButton')}
            describedById="view-chat-id-summary"
            matches={matches}
            {...buildChatIdMatchesLabels(t, matches, matchesTruncated)}
            onSelectMatch={handleSelectMatch}
          />
        </form>
        <StatusMessage variant={status?.variant} message={status?.text} persistent />
      </div>
    </details>
  );
};

export default ViewChatByIdSection;
