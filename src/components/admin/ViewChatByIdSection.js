import React, { useMemo, useState } from 'react';
import StatusMessage from './StatusMessage.js';
import ChatIdLookupField from './ChatIdLookupField.js';
import { buildChatIdMatchesLabels } from './ChatIdMatchList.js';
import { useChatIdLookup } from '../../hooks/admin/useChatIdLookup.js';
import { buildChatReviewHref } from '../../utils/reviewLink.js';

// Chat-ID lookup that ends in a link, never a navigation: whatever the
// search finds - a full UUID, a single-match fragment, or several matches -
// is rendered as ChatIdMatchList's pick-list of <GcdsLink target="_blank">
// items, and the admin clicks the one they want (same treatment as every
// other "view this chat" link, reviewLink.js's GcdsLinks). A confirmed single
// chat is just a one-item list, so both outcomes look and behave the same.
//
// Why not navigate()/window.open() straight to the chat once it's confirmed:
// the confirmation is an awaited network round-trip, so a window.open()
// after it runs outside the browser's user-activation window and gets
// popup-blocked (Safari especially) with a silent null return; and
// navigate() in the same tab lost the admin's place on this page. A real
// link has neither problem, and gives new-tab semantics (icon, sr text,
// middle-click) for free. useChatIdLookup.js's searchChats resolves a full
// UUID or a single-match fragment directly; a fragment matching several
// leaves `matches` populated. EvalDashboardPage.js has its own, unrelated
// "View chat by ID" search - only the label/placeholder strings are shared.
//
// Checks the chat exists (useChatIdLookup.js's shared existence check, same
// as DeleteByChatIdSection.js) before offering the link - previously this
// opened on any non-empty input, landing on an empty review page with no
// explanation for a wrong ID. Doesn't reuse DeleteByChatIdSection.js itself:
// viewing isn't destructive, so it shouldn't trigger its delete-style
// confirm().
//
// One row (its own h2), collapsed by default - same shape as
// DeleteChatSection.js/DeleteExpertEval.js. Pulled out of AdminPage.js so
// it's reusable without duplicating the lookup form.
const ViewChatByIdSection = ({ lang = 'en' }) => {
  const {
    t,
    chatId,
    handleInputChange,
    handleToggle,
    loading,
    setLoading,
    status,
    hasError,
    errorCount,
    errorRef,
    inlineErrorMessage,
    matches,
    matchesTruncated,
    searchChats,
  } = useChatIdLookup({ lang });

  // The one confirmed chat from a direct/single-match lookup, held here (not
  // in the hook) because the hook's `matches` is reserved for the several-
  // matches case and is what ChatViewer.js's on-page picker also reads.
  // Rendered as a one-item ChatIdMatchList under a plain "Chat found."
  // heading (also the focus target) - same shape as the several-matches
  // case, which uses ChatViewer.js's own "{count} matching chats found"
  // labels.
  const [confirmedChatId, setConfirmedChatId] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setConfirmedChatId(null);
    const chat = await searchChats(chatId);
    if (!chat) return; // hook already set the inline/status error state
    setConfirmedChatId(chat.chatId);
    // checkChatExists leaves loading=true on success for the caller's own
    // next step (see its comment); rendering the link *is* that step.
    setLoading(false);
  };

  const clearConfirmed = (handler) => (event) => {
    setConfirmedChatId(null);
    handler(event);
  };

  const hrefForMatch = (matchId) => buildChatReviewHref(matchId, lang);

  // Memoized: ChatIdMatchList keys its focus-move on this array's identity,
  // so a fresh `[confirmedChatId]` on every render would re-yank focus to
  // the results block on any unrelated re-render of this section.
  const listedMatches = useMemo(
    () => (confirmedChatId ? [confirmedChatId] : matches),
    [confirmedChatId, matches]
  );
  const matchLabels = confirmedChatId
    ? { matchesHeading: t('admin.common.chatFound') }
    : buildChatIdMatchesLabels(t, matches, matchesTruncated);

  return (
    <details onToggle={clearConfirmed(handleToggle)}>
      <summary id="view-chat-id-summary">{t('admin.common.viewChatById')}</summary>
      <div className="mt-200 mb-200">
        <form onSubmit={handleSubmit}>
          <ChatIdLookupField
            fieldId="view-chat-id"
            label={t('admin.viewChat.label')}
            placeholder={t('admin.common.chatIdSearchPlaceholder')}
            value={chatId}
            onChange={clearConfirmed(handleInputChange)}
            disabled={loading}
            hasError={hasError}
            errorMessage={inlineErrorMessage}
            errorCount={errorCount}
            errorRef={errorRef}
            buttonLabel={loading ? t('admin.viewChat.loading') : t('admin.common.chatIdSearchButton')}
            describedById="view-chat-id-summary"
            matches={listedMatches}
            {...matchLabels}
            hrefForMatch={hrefForMatch}
          />
        </form>
        <StatusMessage variant={status?.variant} message={status?.text} />
      </div>
    </details>
  );
};

export default ViewChatByIdSection;
