import { DOMAIN_REGISTRY } from '../config/citationDomainRegistry.js';

// Static bilingual strings — kept inline rather than in locale files because
// this is a pure utility with no React context. These strings are stable; if
// they ever need to change, update both EN and FR variants here together.
//
// C8 note: lang is expected to be 'en' or 'fr' only — this app's two official
// languages. Passing any other value will produce undefined behaviour.
const STRINGS = {
  en: {
    opensInNewTab: '(opens in new tab)',
    govCa: 'Government of Canada',
  },
  fr: {
    opensInNewTab: "(s'ouvre dans un nouvel onglet)",
    govCa: 'Gouvernement du Canada',
  },
};

// Path segments that carry no meaningful label information.
// Locale prefixes (en/fr/eng/fra) are included here.
// After stripping file extensions, SharePoint/Drupal defaults (default, index)
// are also meaningless.
const SKIP_SEGMENTS = new Set(['en', 'fr', 'eng', 'fra', 'default', 'index']);

// Segments that look like identifiers rather than readable slugs.
const OPAQUE_PATTERNS = [
  /^\d+$/, // purely numeric: /12345/
  /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i, // UUID
  /^pages$/i, // SharePoint /Pages/
  /^node$/i,  // Drupal /node/
];

function isOpaque(segment) {
  return OPAQUE_PATTERNS.some(p => p.test(segment));
}

// Returns true for GC-owned domains (.gc.ca and canada.ca including subdomains).
function isGcDomain(hostname) {
  return hostname === 'canada.ca' ||
    hostname.endsWith('.canada.ca') ||
    hostname.endsWith('.gc.ca');
}

// Converts a slug string to a readable label using sentence case.
// Casing has no effect on screen readers since this is only used in aria-label.
// Note: if this were ever rendered as visible text (see Option 1 above), proper
// program-name capitalisation would need to be solved — e.g. "Employment Insurance"
// and "CPP" have official forms a slug transform cannot reliably reproduce.
function toReadableLabel(slug) {
  const words = slug.replace(/[-_]/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

// Derives a human-readable label from URL path segments, or returns null if
// no readable slug is found.
function extractSlugLabel(pathname) {
  const rawSegments = pathname
    .split('/')
    .map(s => s.replace(/\.[a-z]{2,5}$/i, '')) // strip file extension
    .filter(s => s && !SKIP_SEGMENTS.has(s.toLowerCase()));

  // If the first remaining segment looks like an unrecognized locale code
  // (letters only, no hyphens, ≤5 chars), skip it. This covers any language
  // prefix other than the known EN/FR variants already in SKIP_SEGMENTS —
  // including indigenous language codes (e.g. 'oji', 'cre', 'moh', 'iku')
  // and other languages (e.g. 'es'). In all these cases the function falls
  // back gracefully to "Government of Canada — domain" via Tier 3, rather
  // than surfacing the raw language code as a label.
  const segments = (
    rawSegments.length > 0 && /^[a-zA-Z]{1,5}$/.test(rawSegments[0])
  ) ? rawSegments.slice(1) : rawSegments;

  const filtered = segments.filter(s => !isOpaque(s));

  if (filtered.length === 0) return null;

  const last = filtered[filtered.length - 1];

  // Must contain at least one letter — rules out any remaining numeric-only values
  if (!/[a-zA-Z]/.test(last)) return null;

  return toReadableLabel(last);
}

// Builds a descriptive aria-label for a GC citation link.
//
// Tier 1 — readable slug in path:
//   "Government of Canada — Employment Insurance — canada.ca (opens in new tab) https://…"
// Tier 2 — opaque/numeric path, domain in registry:
//   "Government of Canada — Indigenous Services Canada — sac-isc.gc.ca (opens in new tab) https://…"
// Tier 3 — unregistered GC domain with opaque path:
//   "Government of Canada — travel.gc.ca (opens in new tab) https://…"
// Tier 3 — non-GC domain (unexpected; upstream validation should prevent this):
//   "example.com (opens in new tab) https://…"
//
// Accessibility approach:
//   WCAG 2.4.4 (Link Purpose): the descriptive prefix ("Government of Canada —
//   Employment Insurance") gives screen reader users meaningful link context without
//   reading surrounding text.
//
//   WCAG 2.5.3 (Label in Name): voice-control users activate links by speaking what
//   they see. The visible text is the raw URL, so the raw URL is appended at the end
//   of the aria-label — after "(opens in new tab)" — so voice control can match it.
//   Screen reader users hear the descriptive prefix first and can move on before the
//   raw URL is announced.
//
//   Alternative considered (Option 1): render the derived label as the visible link
//   text and use a sr-only span for "(opens in new tab)". This satisfies both 2.4.4
//   and 2.5.3 cleanly but hides the raw URL from sighted users, reducing destination
//   transparency on a government service. Revisit if design requirements change.
//
// C7 note: Tier 1 prepends "Government of Canada" to any domain with a readable
// slug. This relies on upstream URL validation ensuring only GC URLs reach here.
export function buildAriaLabel(url, lang = 'en') {
  const s = STRINGS[lang];

  // C1: normalise protocol-relative URLs (//canada.ca/...) so new URL() can
  // parse them — safeHttpHref allows these through but new URL() requires a scheme.
  const normalized = typeof url === 'string' && url.startsWith('//') ? `https:${url}` : url;

  let parsed;
  try {
    parsed = new URL(normalized);
  } catch {
    return '';
  }

  // Strip www. prefix so registry lookups work for both www.canada.ca and canada.ca
  const hostname = parsed.hostname.replace(/^www\./, '');
  // Spoken form for screen readers: "canada dot ca" rather than relying on each
  // reader's punctuation-handling to expand the dot correctly.
  const spokenHostname = hostname.replace(/\./g, ' dot ');

  // C3: decode percent-encoded path characters (e.g. %C3%A9 → é) so slug labels
  // are readable. Falls back to the raw encoded form if decoding fails.
  let pathname;
  try {
    pathname = decodeURIComponent(parsed.pathname);
  } catch {
    pathname = parsed.pathname;
  }

  // Tier 1: readable path slug — no govCa prefix, the domain already signals GC origin
  const slugLabel = extractSlugLabel(pathname);
  if (slugLabel) {
    return `${slugLabel} — ${spokenHostname} ${s.opensInNewTab} ${url}`;
  }

  // Tier 2: domain in registry
  const deptName = DOMAIN_REGISTRY[hostname]?.[lang];
  if (deptName) {
    // When the registry name for this domain IS "Government of Canada" (canada.ca
    // with an opaque path), avoid repeating it: "Government of Canada — canada.ca"
    // rather than "Government of Canada — Government of Canada — canada.ca".
    if (deptName === s.govCa) {
      return `${s.govCa} — ${spokenHostname} ${s.opensInNewTab} ${url}`;
    }
    return `${s.govCa} — ${deptName} — ${spokenHostname} ${s.opensInNewTab} ${url}`;
  }

  // Tier 3: always prefix GC domains with "Government of Canada" so something
  // sensible is returned for unregistered domains or any URL whose path could
  // not produce a readable slug — including indigenous language paths and any
  // other language prefix not covered by SKIP_SEGMENTS.
  if (isGcDomain(hostname)) {
    return `${s.govCa} — ${spokenHostname} ${s.opensInNewTab} ${url}`;
  }

  return `${spokenHostname} ${s.opensInNewTab} ${url}`;
}
