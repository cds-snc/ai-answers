import React from 'react';
import { useNavigate } from 'react-router-dom';
import StatusMessage from './StatusMessage.js';
import ChatIdLookupField from './ChatIdLookupField.js';
import { useChatIdLookup } from '../../hooks/admin/useChatIdLookup.js';

// Quick chat-ID lookup, navigating to the chat viewer for the entered ID -
// requires the full, exact chat ID (a direct navigation, not a search; see
// EvalDashboardPage.js's own "View chat by ID" for the genuinely different
// partial-match search version, which opens a filtered results table
// instead of navigating anywhere).
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
    checkChatExists,
  } = useChatIdLookup({ lang });

  const handleSubmit = async (e) => {
    e.preventDefault();
    const chat = await checkChatExists(chatId);
    if (!chat) return;
    navigate(`/${lang}?chat=${encodeURIComponent(chat.chatId)}&review=1`);
    // No setLoading(false) here on success — this component is about to
    // unmount as the page navigates away.
  };

  return (
    <details onToggle={handleToggle}>
      <summary id="view-chat-id-summary">{t('admin.common.viewChatById')}</summary>
      <div className="mt-200">
        <form onSubmit={handleSubmit}>
          <ChatIdLookupField
            fieldId="view-chat-id"
            label={t('admin.viewChat.label')}
            placeholder={t('admin.common.chatIdPlaceholder')}
            value={chatId}
            onChange={handleInputChange}
            disabled={loading}
            hasError={hasError}
            errorMessage={inlineErrorMessage}
            errorCount={errorCount}
            errorRef={errorRef}
            buttonLabel={loading ? t('admin.viewChat.loading') : t('admin.viewChat.button')}
            describedById="view-chat-id-summary"
          />
        </form>
        <StatusMessage variant={status?.variant} message={status?.text} persistent />
      </div>
    </details>
  );
};

export default ViewChatByIdSection;
