import React from 'react';
import { useFocusOnChange } from '../../hooks/useFocusOnChange.js';

// Shared partial-match pick-list — one button per matching chatId, from
// useChatIdLookup.js's searchChats/matches. Used by ChatIdLookupField.js
// (ViewChatByIdSection.js's form, where it renders directly under the
// field+button) and by ChatViewer.js directly (whose Refresh/Clear buttons
// sit in their own row below the chatId field rather than bundled with it,
// so it can't reuse ChatIdLookupField's own input+button layout wholesale —
// only this list is shared, kept as its own component precisely so both
// places render a partial-match result identically instead of one of them
// hand-rolling a second copy).
//
// matchesHeading/matchesTruncatedMessage are pre-translated strings (same
// convention as ChatIdLookupField's label/placeholder/buttonLabel) so this
// component does no i18n of its own and the caller controls the
// interpolated {count} - via buildChatIdMatchesLabels below, shared by both
// callers instead of each hand-interpolating the same two locale keys.
export function buildChatIdMatchesLabels(t, matches, matchesTruncated) {
  return {
    matchesHeading: t('admin.common.chatIdMatchesFound').replace('{count}', matches?.length ?? 0),
    matchesTruncatedMessage: matchesTruncated
      ? t('admin.common.chatIdMatchesTruncated').replace('{count}', matches?.length ?? 0)
      : null,
  };
}

const ChatIdMatchList = ({ fieldId, matches, matchesHeading, matchesTruncatedMessage, onSelectMatch }) => {
  // Same focus-move pattern as EvalDashboardPage.js's own resultsHeadingRef -
  // otherwise this list (and its "N chats found" heading) just silently
  // appears with nothing to tell a screen-reader user it's there. `matches`
  // itself is enough as the trigger, no separate counter needed: it's
  // always a freshly-fetched array from searchChats, never the same object
  // twice, so this fires on every populated result, including an identical
  // repeat search.
  const headingRef = useFocusOnChange(matches);

  if (!matches || matches.length === 0) {
    return null;
  }

  const headingId = `${fieldId}-matches-heading`;

  return (
    <div className="mt-200">
      {/* .focus-target opts back into global.css's visible focus ring
          (suppressed by default for tabindex="-1" targets, on the
          assumption a sighted keyboard user has nothing to act on there -
          see its own comment). That default doesn't hold here: unlike
          EvalDashboardPage.js's own resultsHeadingRef (sr-only - nothing
          visible to ring in the first place), this heading is real, visible
          text, and it's genuinely an in-page jump target (the pick-list
          right below it), the same shape as BatchUpload's "Go to the
          Incomplete batches section" .focus-target - not a silent
          screen-reader-only cursor move. */}
      <p ref={headingRef} id={headingId} tabIndex={-1} className="focus-target">{matchesHeading}</p>
      <ul className="chat-id-match-list" aria-labelledby={headingId}>
        {matches.map((matchId) => (
          <li key={matchId}>
            <button
              type="button"
              className="filter-button filter-button-outline"
              onClick={() => onSelectMatch(matchId)}
            >
              {matchId}
            </button>
          </li>
        ))}
      </ul>
      {matchesTruncatedMessage && <p>{matchesTruncatedMessage}</p>}
    </div>
  );
};

export default ChatIdMatchList;
