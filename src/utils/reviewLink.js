// Shared "open this chat in review mode" link builders
// (`/{lang}?chat={chatId}&review=1[#interaction=...]`), used by dashboards
// (ChatDashboardPage, EvalDashboardPage, AutoEvalDashboardPage,
// SimilarChatsDashboard) and review panels (ContentIssueChatsCard,
// EvalAnalysisReport, UsedChatsPanel).
//
// Two flavours: a plain href for React <GcdsLink>, and a full <gcds-link>
// HTML string for DataTables render functions, which render raw HTML
// rather than JSX.

import { escapeHtml } from './htmlEscape.js';

const buildInteractionHash = (interactionId) => {
  if (!interactionId) return '';
  return `#interaction=${encodeURIComponent(`interactionId${interactionId}`)}`;
};

// Re-exported under this file's existing name so its consumers
// (ChatDashboardPage.js, EvalDashboardPage.js, UsersPage.js) don't need to
// change their imports - see htmlEscape.js for the actual implementation,
// shared with labelPill.js. Not actually specific to links; kept here only
// for import-compatibility with existing callers.
export const escapeHtmlAttribute = escapeHtml;

// For React <GcdsLink href={...}>.
export const buildChatReviewHref = (chatId, lang, interactionId) =>
  `/${lang}?chat=${encodeURIComponent(chatId)}&review=1${buildInteractionHash(interactionId)}`;

// For DataTables render funcs: a full <gcds-link> HTML string. The custom
// element auto-upgrades once inserted and handles the icon/rel/accessible
// new-tab text itself.
export const buildChatReviewLinkHtml = (chatId, lang, interactionId) => {
  const safeId = escapeHtmlAttribute(chatId);
  return `<gcds-link href="/${lang}?chat=${safeId}&review=1${buildInteractionHash(interactionId)}" target="_blank" lang="${lang}">${safeId}</gcds-link>`;
};
