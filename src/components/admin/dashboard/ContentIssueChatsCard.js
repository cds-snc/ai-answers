import React from 'react';
import { GcdsLink } from '@gcds-core/components-react';
import CollapsibleCard from './CollapsibleCard.js';
import { buildChatReviewHref, chatLangFromPageLanguage } from '../../../utils/reviewLink.js';

// Collapsible list of chats matching some expert-feedback flag (content
// issue, harmful, ...), server-scoped to the dashboard's current filters.
// `chats` = [{ chatId, interactionId, pageLanguage, createdAt, status? }].
// `statusColLabel`/`statusLabels` are optional — pass them when rows carry a
// per-row `status` worth distinguishing (e.g. content issues' 'hasError' |
// 'needsImprovement' split); omit them for a homogeneous list where every
// row already means the same thing (e.g. a harmful-chats list) and a repeated
// status pill would be redundant. Each row links to that interaction in
// review mode, in its own language, in a new tab — GcdsLink's target="_blank"
// handles the icon, rel, and a localized "(Opens destination in a new tab.)"
// accessible label on its own; no custom icon/sr-only markup needed.
// Title/subtitle are always visible; the table sits behind `triggerLabel`.
const ContentIssueChatsCard = ({
  title,
  subtitle,
  triggerLabel,
  chats = [],
  lang = 'en',
  chatIdColLabel,
  dateColLabel,
  statusColLabel,
  statusLabels = {},
  noDataLabel,
  defaultOpen = false,
  anchorId = null,
  collapsible = true,
}) => {
  const showStatus = Boolean(statusColLabel);
  const locale = lang === 'fr' ? 'fr-CA' : 'en-CA';
  const fmtDate = (d) => (d ? new Date(d).toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric' }) : '—');
  const cell = { borderBottom: '1px solid #e0e0e0', padding: '8px 8px' };
  const head = { borderBottom: '2px solid #e0e0e0', padding: '8px 8px', textAlign: 'left' };

  return (
    <CollapsibleCard heading={title} subtext={subtitle} triggerLabel={triggerLabel} defaultOpen={defaultOpen} anchorId={anchorId} collapsible={collapsible}>
      {chats.length === 0 ? (
        <p className="font-size-text-xsm-nr">{noDataLabel}</p>
      ) : (
        /* Wide table scrolls in its own container so the page body never
           scrolls sideways. tabIndex makes the scroll region keyboard-reachable
           when columns overflow on a narrow viewport. */
        <div style={{ overflowX: 'auto' }} tabIndex={0}>
          <table className="display" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '1rem' }}>
            <caption className="sr-only">{title}</caption>
            <thead>
              <tr>
                <th scope="col" style={head}>{chatIdColLabel}</th>
                {showStatus && <th scope="col" style={head}>{statusColLabel}</th>}
                <th scope="col" style={head}>{dateColLabel}</th>
              </tr>
            </thead>
            <tbody>
              {chats.map((c) => {
                // Route to the chat's OWN pageLanguage, not the admin's
                // current UI language - see the note in ChatDashboardPage.js.
                // The admin's own language rides along separately as the
                // `adminLang` query param (4th arg) for the review page's
                // own chrome to use.
                const chatLang = chatLangFromPageLanguage(c.pageLanguage);
                const href = buildChatReviewHref(c.chatId, chatLang, c.interactionId, lang);
                return (
                  <tr key={`${c.chatId}-${c.interactionId}`}>
                    <td style={{ ...cell, wordBreak: 'break-all' }}>
                      {/* TODO: GcdsLink's shadow-DOM template renders a
                          literal non-breaking space inside the <a> before
                          its icon — see CountTable.js's GcdsLink for the
                          full note. Same upstream GC DS issue, not fixable
                          from our CSS (real shadow DOM, no exposed `part`
                          on that span). */}
                      <GcdsLink href={href} target="_blank" lang={lang}>{c.chatId}</GcdsLink>
                    </td>
                    <td style={cell}>
                      <span className={`label ${c.status}`}>{statusLabels[c.status] || c.status}</span>
                    </td>
                    <td style={cell}>{fmtDate(c.createdAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </CollapsibleCard>
  );
};

export default ContentIssueChatsCard;
