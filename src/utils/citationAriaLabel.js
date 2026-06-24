import { DOMAIN_REGISTRY } from '../config/citationDomainRegistry.js';

// Static bilingual strings — kept inline rather than in locale files because
// this is a pure utility with no React context. These strings are stable; if
// they ever need to change, update both EN and FR variants here together.
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

// Derives a human-readable label from URL path segments, or returns null if
// no readable slug is found.
function extractSlugLabel(pathname) {
  const segments = pathname
    .split('/')
    .map(s => s.replace(/\.[a-z]{2,5}$/i, '')) // strip file extension
    .filter(s => s && !SKIP_SEGMENTS.has(s.toLowerCase()))
    .filter(s => !isOpaque(s));

  if (segments.length === 0) return null;

  const last = segments[segments.length - 1];

  // Must contain at least one letter — rules out any remaining numeric-only values
  if (!/[a-zA-Z]/.test(last)) return null;

  // Title-case: hyphens and underscores become word separators
  return last
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

// Builds a descriptive aria-label for a GC citation link.
//
// Tier 1 — readable slug in path:
//   "Government of Canada — Employment Insurance — canada.ca (opens in new tab)"
// Tier 2 — opaque/numeric path, domain in registry:
//   "Government of Canada — Indigenous Services Canada — sac-isc.gc.ca (opens in new tab)"
// Tier 3 — unknown domain, opaque path (domain-only fallback):
//   "unknown-dept.gc.ca (opens in new tab)"
//
// WCAG 2.5.3 note: the aria-label differs from the visible link text (raw URL).
// This is intentional — 2.5.3 targets speech-input activation of named controls,
// not descriptive overlays on URLs — but flag for accessibility audit if needed.
export function buildAriaLabel(url, lang = 'en') {
  const s = STRINGS[lang];

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return '';
  }

  // Strip www. prefix so registry lookups work for both www.canada.ca and canada.ca
  const hostname = parsed.hostname.replace(/^www\./, '');

  // Tier 1: readable path slug
  const slugLabel = extractSlugLabel(parsed.pathname);
  if (slugLabel) {
    return `${s.govCa} — ${slugLabel} — ${hostname} ${s.opensInNewTab}`;
  }

  // Tier 2: domain in registry
  const deptName = DOMAIN_REGISTRY[hostname]?.[lang];
  if (deptName) {
    // When the registry name for this domain IS "Government of Canada" (canada.ca
    // with an opaque path), avoid repeating it: "Government of Canada — canada.ca"
    // rather than "Government of Canada — Government of Canada — canada.ca".
    if (deptName === s.govCa) {
      return `${s.govCa} — ${hostname} ${s.opensInNewTab}`;
    }
    return `${s.govCa} — ${deptName} — ${hostname} ${s.opensInNewTab}`;
  }

  // Tier 3: unknown domain, opaque path — domain + "opens in new tab" only
  return `${hostname} ${s.opensInNewTab}`;
}
