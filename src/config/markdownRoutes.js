// src/config/markdownRoutes.js
//
// Maps a full request path to the markdown file (under public/, mirrored to
// build/ by `vite build`) that drives it client-side - AboutPage.js and
// HowToPage.js fetch their content and set document.title from its YAML
// frontmatter, via useMarkdownWithFrontmatter. That's even later than
// App.js's title effect (a network round trip after mount), so these routes
// need the same server-side fix - see server/renderIndexHtml.js.
//
// Unlike routeTitleKeys.js, not hand-duplicated: built directly from
// getPath()/ROUTE_SLUGS and HOW_TOS, the same data App.js itself uses to
// register these routes, so it can't drift from what's actually registered.
import { getPath } from '../utils/routes.js';
import { HOW_TOS, HOW_TO_CONTENT_DIR } from './howTos.js';
import { normalizePathname } from '../utils/normalizePathname.js';

// Matches the default `contentDir` AboutPage.js passes to
// useMarkdownWithFrontmatter('about-en.md'/'about-fr.md').
const ABOUT_CONTENT_DIR = '/content';

export const MARKDOWN_ROUTES = {
  [getPath('about', 'en')]: { dir: ABOUT_CONTENT_DIR, file: 'about-en.md' },
  [getPath('about', 'fr')]: { dir: ABOUT_CONTENT_DIR, file: 'about-fr.md' },
  ...Object.fromEntries(
    HOW_TOS.flatMap((howTo) =>
      ['en', 'fr'].map((lang) => [
        getPath(howTo.route, lang),
        { dir: HOW_TO_CONTENT_DIR, file: howTo.files[lang] },
      ])
    )
  ),
};

// Resolves a real request path to { dir, file } for the markdown file that
// drives it, or null if the path isn't a markdown-driven route.
export const getMarkdownRouteForPath = (pathname) => {
  const normalized = normalizePathname(pathname);
  return MARKDOWN_ROUTES[normalized] || null;
};
