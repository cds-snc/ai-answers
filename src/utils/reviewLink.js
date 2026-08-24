// Shared "open this chat in review mode" link builders
// (`/{lang}?chat={chatId}&review=1&adminLang={adminLang}[#interaction=...]`),
// used by dashboards (ChatDashboardPage, EvalDashboardPage,
// AutoEvalDashboardPage, SimilarChatsDashboard) and review panels
// (ContentIssueChatsCard, EvalAnalysisReport, UsedChatsPanel).
//
// `lang` (the route itself) is the reviewed CHAT's own pageLanguage, not the
// admin's - the review page's route, and everything embedded in the actual
// transcript (the answer bubbles, the citation heading), must show what the
// end user actually experienced (official-languages.md Rule 2), not get
// swapped for the admin's own preference. `adminLang` carries the admin's
// own current UI language separately, forward as a query param, for the
// admin-only chrome around that transcript (ExpertFeedbackPanel, "How was
// this answer?", Chat ID/Date/Referring URL labels, etc.) to use instead -
// see HomePage.js's review-mode fetch and ChatAppContainer.js's `adminLang`
// prop for where this gets read back out and threaded to those components.
//
// Two flavours: a plain href for React <GcdsLink>, and a full <gcds-link>
// HTML string for DataTables render functions, which render raw HTML
// rather than JSX.

import { escapeHtml } from './htmlEscape.js';

const buildInteractionHash = (interactionId) => {
  if (!interactionId) return '';
  return `#interaction=${encodeURIComponent(`interactionId${interactionId}`)}`;
};

const buildAdminLangParam = (adminLang) =>
  adminLang ? `&adminLang=${encodeURIComponent(adminLang)}` : '';

// Shared 'en'/'fr' normalization for a stored pageLanguage value (which can
// be a full BCP-47/ISO tag like 'fr-CA' or 'fra', not just 'fr') - every
// review-link caller that routes by the reviewed chat's own language needs
// this same fallback-to-'en' rule, so it lives here once rather than being
// copy-pasted per dashboard/panel.
export const chatLangFromPageLanguage = (pageLanguage) =>
  (pageLanguage && pageLanguage.toLowerCase().includes('fr')) ? 'fr' : 'en';

// Re-exported under this file's existing name so its consumers
// (ChatDashboardPage.js, EvalDashboardPage.js, UsersPage.js) don't need to
// change their imports - see htmlEscape.js for the actual implementation,
// shared with labelPill.js. Not actually specific to links; kept here only
// for import-compatibility with existing callers.
export const escapeHtmlAttribute = escapeHtml;

// For React <GcdsLink href={...}>.
export const buildChatReviewHref = (chatId, lang, interactionId, adminLang) =>
  `/${lang}?chat=${encodeURIComponent(chatId)}&review=1${buildAdminLangParam(adminLang)}${buildInteractionHash(interactionId)}`;

// For DataTables render funcs: a full <gcds-link> HTML string. The custom
// element auto-upgrades once inserted and handles the icon/rel/accessible
// new-tab text itself.
//
// The link's `lang` HTML attribute deliberately does NOT use `lang` (the
// route's language) - the visible text here is always just the opaque
// chatId, never real content needing destination-language pronunciation
// (contrast CountTable.js's citation links, where the visible text *is*
// real content and must match the URL's own language). What `lang` here
// actually drives is GcdsLink's own auto-generated "(opens in a new tab)"
// hint text, which is admin-facing navigation chrome - it should match the
// admin's own current language (adminLang), the same reasoning already
// applied to ContentIssueChatsCard.js's <GcdsLink>. Falls back to `lang`
// (the route) only when no adminLang was supplied at all.
export const buildChatReviewLinkHtml = (chatId, lang, interactionId, adminLang) => {
  const safeId = escapeHtmlAttribute(chatId);
  const adminLangParam = adminLang ? `&adminLang=${escapeHtmlAttribute(adminLang)}` : '';
  const attrLang = escapeHtmlAttribute(adminLang || lang);
  return `<gcds-link href="/${lang}?chat=${safeId}&review=1${adminLangParam}${buildInteractionHash(interactionId)}" target="_blank" lang="${attrLang}">${safeId}</gcds-link>`;
};
