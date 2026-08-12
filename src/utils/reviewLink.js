// Shared "open this chat in review mode" link builders
// (`/{lang}?chat={chatId}&review=1[#interaction=...]`), used by dashboards
// (ChatDashboardPage, EvalDashboardPage, AutoEvalDashboardPage,
// SimilarChatsDashboard) and review panels (ContentIssueChatsCard,
// EvalAnalysisReport, UsedChatsPanel).
//
// Two flavours: a plain href for React <GcdsLink>, and a full <gcds-link>
// HTML string for DataTables render functions, which render raw HTML
// rather than JSX.

const buildInteractionHash = (interactionId) => {
  if (!interactionId) return '';
  return `#interaction=${encodeURIComponent(`interactionId${interactionId}`)}`;
};

// Escapes a value for safe interpolation into an HTML attribute/text
// context. Also used by DataTables columns unrelated to this link.
export const escapeHtmlAttribute = (value) => {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
};

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
