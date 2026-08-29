import React from 'react';
import { GcdsLink } from '@gcds-core/components-react';
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
// matchesHeading is a pre-translated string (same convention as
// ChatIdLookupField's label/placeholder/buttonLabel) so this component does
// no i18n of its own and the caller controls the interpolated {count} - via
// buildChatIdMatchesLabels below, shared by both callers instead of each
// hand-interpolating the same locale keys.
//
// The search API (db-chat-search.js) caps results at MAX_RESULTS and only
// reports `truncated`, not a real total - so when truncated the heading says
// "More than {count} ... found" rather than presenting the capped length as
// the count, which read as "10 found" when 14 existed.
export function buildChatIdMatchesLabels(t, matches, matchesTruncated) {
  const count = matches?.length ?? 0;
  const heading = matchesTruncated
    ? t('admin.common.chatIdMatchesMoreFound')
    : t('admin.common.chatIdMatchesFound');
  return { matchesHeading: heading.replace('{count}', count) };
}

// Two render modes, picked by the caller:
// - onSelectMatch (ChatViewer.js): one <button> per match, picking one stays
//   on the page (loads that chat's logs in place).
// - hrefForMatch (ViewChatByIdSection.js): one <GcdsLink target="_blank">
//   per match, opening the chat review page in a new tab. A real link, not
//   a button firing window.open(): the lookup that produced the list already
//   finished its network round-trip, so a window.open() there runs outside
//   the browser's user-activation window and gets popup-blocked (Safari
//   especially). GcdsLink also supplies the external icon and its own
//   "(Opens destination in a new tab.)" text in both languages.
const ChatIdMatchList = ({
  fieldId,
  matches,
  matchesHeading,
  onSelectMatch,
  hrefForMatch,
}) => {
  // Focus lands on the wrapper (heading + list together), not the heading
  // alone - otherwise a screen-reader user hears just "Chat found." and has
  // no idea the link(s) sit right below it (real-AT finding, PR #1765).
  // Focusing the container reads the heading and the pick-list as one
  // block; the list is bounded by the search API's MAX_RESULTS so this
  // never turns into an unbounded blob. Same shape as BatchPage's focused
  // tabindex="-1" section. `matches` itself is enough as the trigger, no
  // separate counter needed: it's always a freshly-fetched array from
  // searchChats, never the same object twice, so this fires on every
  // populated result, including an identical repeat search.
  const wrapperRef = useFocusOnChange(matches);

  if (!matches || matches.length === 0) {
    return null;
  }

  const headingId = `${fieldId}-matches-heading`;

  return (
    // .focus-target opts back into global.css's visible focus ring
    // (suppressed by default for tabindex="-1" targets, on the assumption
    // a sighted keyboard user has nothing to act on there - see its own
    // comment). That default doesn't hold here: this block is real,
    // visible content and genuinely an in-page jump target (the pick-list
    // is what the admin acts on next), the same shape as BatchUpload's "Go
    // to the Incomplete batches section" .focus-target - not a silent
    // screen-reader-only cursor move.
    <div ref={wrapperRef} tabIndex={-1} className="mt-200 focus-target">
      <p id={headingId}>{matchesHeading}</p>
      <ul className="chat-id-match-list mb-200" aria-labelledby={headingId}>
        {matches.map((matchId) => (
          <li key={matchId}>
            {hrefForMatch ? (
              <GcdsLink href={hrefForMatch(matchId)} target="_blank">
                {matchId}
              </GcdsLink>
            ) : (
              <button
                type="button"
                className="filter-button filter-button-outline"
                onClick={() => onSelectMatch(matchId)}
              >
                {matchId}
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
};

export default ChatIdMatchList;
