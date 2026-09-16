// src/hooks/usePageMetadata.js
//
// Extracted out of AppLayout (src/App.js): per-route derivation
// (isChatReviewMode, skipRouteFocus) and the client-side <title>/meta-tag
// effect used to live inline in that component - against AGENTS.md's
// "Page -> route-level composition only" rule.
//
// No existing library replaces this. react-helmet-async is the standard
// "declarative per-route <title>/meta" package, but it only runs
// client-side - it wouldn't touch the real-page-load half of this problem
// (server/renderIndexHtml.js), since this app has no SSR to extract Helmet's
// context into. It'd only swap the effect below for a JSX-based API - a
// possible future simplification, not a fix for the actual hard part.
import { useEffect, useRef } from 'react';
import { useLocation, useMatches } from 'react-router-dom';
import { DEFAULT_METADATA, DCTERMS } from '../config/metadata.js';
import { buildPageTitle } from '../config/pageTitle.js';
import { announce } from '../utils/liveAnnouncer.js';

// currentLang/t are passed in rather than re-derived here (computeAlternateLangHref/
// useTranslations) since AppLayout already computes both for its own render -
// no reason to duplicate that work inside this hook too.
export const usePageMetadata = (currentLang, t) => {
  const location = useLocation();
  const matches = useMatches();

  // Review mode (?chat=...&review=1) is only ever reached via a real page
  // load now (ViewChatByIdSection.js renders a GcdsLink target="_blank",
  // same as every other "view this chat" link) - no client-side navigate() lands
  // here, so it needs no special-casing in skipRouteFocus. Still matters for
  // the title effect below: a real page load's <title> can't know about
  // ?review=1 server-side, so the client corrects it post-mount like any
  // other titleKey-less route.
  const isChatReviewMode = new URLSearchParams(location.search).get('review') === '1';

  // Only opt-out from the generic focus-to-main AppLayout wires up via
  // useRouteChangeFocus: routes whose handle says so (the chat home, whose
  // textarea autofocus wins instead — see App.js's route table).
  const skipRouteFocus = matches.some((m) => m.handle?.skipRouteFocus);

  // Each route's titleKey (see App.js's route table) reuses that page's
  // own <h1> locale key - no duplicate "page title" string to drift from
  // what actually renders. No titleKey -> generic site title (every route's
  // previous behaviour). Review mode can't use a static route handle (same
  // home route, distinguished only by a query param), so it's special-cased
  // here, reusing ChatReviewPage.js's own eyebrow text.
  // TODO: isChatReviewMode only checks the query param, not the route -
  // any route carrying ?review=1 would get the review title. Not reachable
  // today (nothing links that way); scope to the home route if it is.
  const pageTitleKey = isChatReviewMode
    ? 'homepage.chat.review.eyebrow'
    : matches.find((m) => m.handle?.titleKey)?.handle?.titleKey;
  const pageTitle = pageTitleKey ? t(pageTitleKey) : null;
  const title = buildPageTitle(pageTitle, currentLang);

  // A real page load reads the new <title> for free; a client-side route
  // change (navigate()/<Link>) doesn't - document.title changing is silent
  // to a screen reader, and useRouteChangeFocus's focus-to-<main> only
  // says "main". Announce the page's own title so the destination is
  // named. Skips the first render (a fresh load) and the routes that opt
  // out of route focus (the chat home). Keyed on location.key, same as
  // useRouteChangeFocus, so a query-string-only navigation counts too.
  const isInitialRouteRef = useRef(true);
  useEffect(() => {
    if (isInitialRouteRef.current) {
      isInitialRouteRef.current = false;
      return;
    }
    if (skipRouteFocus) return;
    announce(pageTitle || title);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key]);

  // Update <title>/lang/dcterms/og/twitter meta tags based on the current
  // route and language.
  useEffect(() => {
    // Pages can opt-out by setting window.__CUSTOM_METADATA_ACTIVE (set by frontmatter hook)
    const isCustomMetadataPage =
      typeof window !== 'undefined' && window.__CUSTOM_METADATA_ACTIVE === true;

    const langKey = currentLang === 'fr' ? 'FR' : 'EN';
    const ogImage = currentLang === 'fr' ? 'og-image-fr.png' : 'og-image-en.png';
    const description = DEFAULT_METADATA.DESCRIPTION[langKey];
    const dctermsDescription = DEFAULT_METADATA.DESCRIPTION[langKey];
    const dctermsLang = currentLang === 'fr' ? 'fra' : 'eng';
    const author = DCTERMS.CREATOR[langKey];
    const dctermsCreator = DCTERMS.CREATOR[langKey];
    const dctermsAudience = currentLang === 'fr' ? 'grand public' : 'general public';
    let projectStatusMeta = document.querySelector('meta[name="project-status"]');
    if (projectStatusMeta) {
      const projectStatus = currentLang === 'fr' ? 'bêta' : 'beta';
      projectStatusMeta.setAttribute('content', projectStatus);
    }

    // Only update title and description for pages without custom metadata
    if (!isCustomMetadataPage) {
      // Update page title
      document.title = title;

      // Update dcterms.title
      let dctermsTitleMeta = document.querySelector('meta[name="dcterms.title"]');
      if (dctermsTitleMeta) {
        dctermsTitleMeta.setAttribute('content', title);
      }

      // Update description meta tag
      let descMeta = document.querySelector('meta[name="description"]');
      if (descMeta) {
        descMeta.setAttribute('content', description);
      }
    }

    // Update dcterms.language
    let dctermsLangMeta = document.querySelector('meta[name="dcterms.language"]');
    if (dctermsLangMeta) {
      dctermsLangMeta.setAttribute('content', dctermsLang);
    }

    // Update dcterms.description
    let dctermsDescMeta = document.querySelector('meta[name="dcterms.description"]');
    if (dctermsDescMeta) {
      dctermsDescMeta.setAttribute('content', dctermsDescription);
    }

    // Update author meta tag
    let authorMeta = document.querySelector('meta[name="author"]');
    if (authorMeta) {
      authorMeta.setAttribute('content', author);
    }

    // Update dcterms.creator
    let dctermsCreatorMeta = document.querySelector('meta[name="dcterms.creator"]');
    if (dctermsCreatorMeta) {
      dctermsCreatorMeta.setAttribute('content', dctermsCreator);
    }

    // Update dcterms.audience
    let dctermsAudienceMeta = document.querySelector('meta[name="dcterms.audience"]');
    if (dctermsAudienceMeta) {
      dctermsAudienceMeta.setAttribute('content', dctermsAudience);
    }

    // Only update social media meta tags for pages without custom metadata
    if (!isCustomMetadataPage) {
      // Update og:title
      let ogTitleMeta = document.querySelector('meta[property="og:title"]');
      if (ogTitleMeta) {
        ogTitleMeta.setAttribute('content', title);
      }

      // Update og:description
      let ogDescMeta = document.querySelector('meta[property="og:description"]');
      if (ogDescMeta) {
        ogDescMeta.setAttribute('content', description);
      }

      // Update og:image meta tag
      let ogImageMeta = document.querySelector('meta[property="og:image"]');
      if (ogImageMeta) {
        ogImageMeta.setAttribute('content', ogImage);
      }

      // Update twitter:title
      let twitterTitleMeta = document.querySelector('meta[property="twitter:title"]');
      if (twitterTitleMeta) {
        twitterTitleMeta.setAttribute('content', title);
      }

      // Update twitter:description
      let twitterDescMeta = document.querySelector('meta[property="twitter:description"]');
      if (twitterDescMeta) {
        twitterDescMeta.setAttribute('content', description);
      }

      // Update twitter:image meta tag
      let twitterImageMeta = document.querySelector('meta[property="twitter:image"]');
      if (twitterImageMeta) {
        twitterImageMeta.setAttribute('content', ogImage);
      }
    }
  }, [currentLang, location.pathname, matches, t, isChatReviewMode]);

  return { skipRouteFocus };
};
