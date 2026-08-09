/**
 * How-to guides shown in the "How to" section of the admin page.
 *
 * CONTENT EDITING:
 * The text for each guide is a markdown file under public/content/admin/,
 * one per language. Edit those files directly — no code change needed.
 * Screenshots live in public/content/admin/images/ and are referenced from
 * the markdown with absolute paths (/content/admin/images/...).
 *
 * To add a new guide:
 *   1. Add the two markdown files to public/content/admin/
 *   2. Add a route entry to ROUTE_SLUGS in src/utils/routes.js
 *   3. Add an entry below, with the matching route name
 *   4. Add the titleKey to both src/locales/en.json and src/locales/fr.json
 */
export const HOW_TOS = [
  {
    id: 'eval-informed-answers',
    route: 'how-to-eval-informed',
    titleKey: 'admin.howTo.evalInformedAnswers',
    files: {
      en: 'how-to-eval-informed-answers.md',
      fr: 'comment-reponses-informees-par-evaluations.md',
    },
  },
];

/** Directory under public/ that holds the how-to markdown and images. */
export const HOW_TO_CONTENT_DIR = '/content/admin';

/** Look up a how-to by its id. Returns undefined if there is no such guide. */
export const getHowTo = (id) => HOW_TOS.find((howTo) => howTo.id === id);

export default HOW_TOS;
