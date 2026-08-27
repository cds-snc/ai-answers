// server/renderIndexHtml.js
//
// Patches the built index.html's <title>, <html lang>, and the
// dcterms/og/twitter title+language+description meta tags for a given
// request path, before server.js sends it.
//
// Why this exists: index.html ships one static, generic <title> and a
// hardcoded lang="en". The client-side title/lang effects run too late for a
// real (non-SPA) page load - the browser's one-shot <title> announcement and
// GCDS web components' first [lang] read both happen off whatever was in the
// initial HTML. A client-side patch can't fix that; the bytes have to be
// right the first time. navigate()-driven SPA transitions don't have this
// problem (no fresh document to race).
//
// Mostly a pure string transform - the one exception is markdown-driven
// routes (About, the how-to guides), which read their title from a real file
// on disk rather than a locale key (see resolveMarkdownMeta below).
import fs from 'fs';
import path from 'path';
import { getTitleKeyForPath } from '../src/config/routeTitleKeys.js';
import { getMarkdownRouteForPath } from '../src/config/markdownRoutes.js';
import { translate } from '../src/utils/translate.js';
import { parseFrontmatter } from '../src/utils/markdownFrontmatter.js';
import { buildPageTitle } from '../src/config/pageTitle.js';
import { DEFAULT_METADATA } from '../src/config/metadata.js';
import { escapeHtml } from '../src/utils/htmlEscape.js';
import { normalizePathname } from '../src/utils/normalizePathname.js';

const setMetaContent = (html, attr, attrValue, content) => {
  const pattern = new RegExp(`(<meta\\s+${attr}="${attrValue}"\\s+content=")[^"]*("\\s*/?>)`);
  return html.replace(pattern, (full, pre, post) => `${pre}${escapeHtml(content)}${post}`);
};

// /en/* and /fr/* paths carry their language. Bare '/' doesn't, so it
// follows the host instead - the same rule App.js uses to pick which home
// to render there (`reponses-ia.*` -> French, anything else -> English; see
// its `defaultLang`). Without this the French host's root shipped
// lang="en" and the English <title>, and the client's post-mount fix came
// too late for the one-shot <title>/[lang] read this file exists to get
// right. Anything else (a path outside the known UI route surface) is left
// at index.html's static defaults - server.js never sends index.html for
// those anyway.
const langFromPath = (pathname, hostname) => {
  if (pathname === '/fr' || pathname.startsWith('/fr/')) return 'fr';
  if (pathname === '/en' || pathname.startsWith('/en/')) return 'en';
  if (pathname === '/') return /^reponses-ia(?:\.|$)/.test(hostname || '') ? 'fr' : 'en';
  return null;
};

// AboutPage.js/HowToPage.js set document.title straight to frontmatter.title
// (no site-title suffix), so this mirrors that instead of using
// buildPageTitle. Returns null - callers fall back to the titleKey path
// below - if the path isn't a markdown route, the file can't be read, or it
// has no title in frontmatter.
//
// Cached per markdown file after the first read: the files are build output
// and never change at runtime, so re-reading (a sync disk read that blocks
// the event loop) and re-parsing on every request was pure waste - same
// reasoning as server.js's cachedIndexHtmlTemplate. A failed read is cached
// as null too, so a missing file doesn't retry the disk on every hit.
const markdownMetaCache = new Map();

const readMarkdownMeta = (contentRoot, markdownRoute, pathname, langKey) => {
  try {
    const filePath = path.join(contentRoot, markdownRoute.dir, markdownRoute.file);
    const raw = fs.readFileSync(filePath, 'utf8');
    const { frontmatter } = parseFrontmatter(raw);
    if (!frontmatter.title) return null;
    return {
      title: frontmatter.title,
      description: frontmatter.description || DEFAULT_METADATA.DESCRIPTION[langKey],
    };
  } catch (err) {
    // %s placeholders, not template-literal interpolation: pathname is
    // request-controlled (req.path), and console.warn's first argument is a
    // format string (Node's util.format) - interpolating untrusted input
    // into it directly would let a crafted path inject its own %-directives.
    console.warn('renderIndexHtml: failed to read markdown meta for %s: %s', pathname, err.message);
    return null;
  }
};

const resolveMarkdownMeta = (contentRoot, pathname, langKey) => {
  if (!contentRoot) return null;
  const markdownRoute = getMarkdownRouteForPath(pathname);
  if (!markdownRoute) return null;

  // Keyed by the resolved file, not the request path, so /en/about and
  // /en/about/ share one entry and a test's alternate contentRoot gets its own.
  const cacheKey = path.join(contentRoot, markdownRoute.dir, markdownRoute.file);
  if (!markdownMetaCache.has(cacheKey)) {
    markdownMetaCache.set(cacheKey, readMarkdownMeta(contentRoot, markdownRoute, pathname, langKey));
  }
  return markdownMetaCache.get(cacheKey);
};

// contentRoot: base directory markdownRoutes.js's `dir`s are relative to
// (server.js passes the build output dir; tests can pass repo-root `public`
// directly, since vite build copies public/* into build/* unchanged).
// hostname: req.hostname - only consulted for bare '/' (see langFromPath).
export const renderIndexHtml = (template, pathname, { contentRoot, hostname } = {}) => {
  const lang = langFromPath(normalizePathname(pathname), hostname);
  if (!lang) return template;

  const langKey = lang === 'fr' ? 'FR' : 'EN';
  const markdownMeta = resolveMarkdownMeta(contentRoot, pathname, langKey);

  let title;
  let description;
  if (markdownMeta) {
    ({ title, description } = markdownMeta);
  } else {
    const titleKey = getTitleKeyForPath(pathname);
    const pageTitle = titleKey ? translate(titleKey, lang) : null;
    title = buildPageTitle(pageTitle, lang);
    description = DEFAULT_METADATA.DESCRIPTION[langKey];
  }

  const dctermsLang = lang === 'fr' ? 'fra' : 'eng';

  let html = template;
  html = html.replace(/<html lang="[^"]*">/, `<html lang="${lang}">`);
  // Function replacer, not a string one: a string replacement gives
  // $&/$$/$1-etc. special meaning to String.replace(), and title can come
  // from freely-editable markdown frontmatter - a literal `$` would corrupt
  // the tag. A function's return value is inserted verbatim (setMetaContent
  // below already does this).
  html = html.replace(/<title>[^<]*<\/title>/, () => `<title>${escapeHtml(title)}</title>`);
  html = setMetaContent(html, 'name', 'description', description);
  html = setMetaContent(html, 'name', 'dcterms\\.title', title);
  html = setMetaContent(html, 'name', 'dcterms\\.language', dctermsLang);
  html = setMetaContent(html, 'name', 'dcterms\\.description', description);
  html = setMetaContent(html, 'property', 'og:title', title);
  html = setMetaContent(html, 'property', 'og:description', description);
  html = setMetaContent(html, 'property', 'twitter:title', title);
  html = setMetaContent(html, 'property', 'twitter:description', description);

  return html;
};
