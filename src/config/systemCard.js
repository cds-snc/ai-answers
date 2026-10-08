/**
 * System card page (SystemCardPage.js).
 *
 * CONTENT EDITING:
 * The single source of truth is the system card at the repo root:
 *
 *   - English: SYSTEM_CARD.md
 *   - French:  SYSTEM_CARD_FR.md
 *
 * Edit those files directly. At build time (and on request in `npm start`),
 * the systemCard plugin in vite.config.js turns each one into the page's
 * markdown with src/utils/systemCardMarkdown.js and serves it, plus every
 * image/PDF it links to, under SYSTEM_CARD_CONTENT_DIR. So the page never
 * depends on GitHub being up.
 */

/** Directory the generated markdown and its assets are served from. */
export const SYSTEM_CARD_CONTENT_DIR = '/content/system-card';

/** Repo-root source file and generated page file, per language. */
export const SYSTEM_CARD_FILES = {
  en: { source: 'SYSTEM_CARD.md', file: 'system-card-en.md' },
  fr: { source: 'SYSTEM_CARD_FR.md', file: 'system-card-fr.md' },
};

/**
 * Page description for search/social metadata. Lives here rather than in
 * the card's own frontmatter, because GitHub renders YAML frontmatter as a
 * table at the top of the file.
 */
export const SYSTEM_CARD_DESCRIPTIONS = {
  en: 'How Canada.ca AI Answers works, how it protects users, and how it is evaluated and governed.',
  fr: 'Le fonctionnement de Réponses IA de Canada.ca, la protection des utilisateurs, ainsi que l’évaluation et la gouvernance du système.',
};

/**
 * Wording the build writes into the generated markdown. Kept here, not in the
 * locale files: vite.config.js loads this at build time, and its config
 * loader can't parse the locale JSON (it starts with a byte-order mark).
 */
export const SYSTEM_CARD_BUILD_TEXT = {
  en: { title: 'AI Answers system card', imageUnavailable: 'Image unavailable', pdfUnavailable: 'PDF unavailable' },
  fr: { title: 'Fiche système Réponses IA', imageUnavailable: 'Image non disponible', pdfUnavailable: 'PDF non disponible' },
};

/** Base URL for repo files the card links to that the app doesn't serve. */
export const REPO_BLOB_URL = 'https://github.com/cds-snc/ai-answers/blob/main';
