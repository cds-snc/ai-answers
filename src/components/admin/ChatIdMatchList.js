import React from 'react';

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
// interpolated {count}.
const ChatIdMatchList = ({ fieldId, matches, matchesHeading, matchesTruncatedMessage, onSelectMatch }) => {
  if (!matches || matches.length === 0) {
    return null;
  }

  const headingId = `${fieldId}-matches-heading`;

  return (
    <div className="mt-200">
      <p id={headingId}>{matchesHeading}</p>
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
