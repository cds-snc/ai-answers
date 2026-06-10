// Shared colour palette for the admin dashboards (exec, partner, and future
// dashboards). Single source of truth — change a value here and every chart
// that references it updates. Greys / text / border chrome stay local to the
// components; this file holds the semantic *data* colours only.
const BRAND = '#1565c0';
const BRAND_DARK = '#0d47a1';

export const COLOURS = {
  // Brand / primary
  brand: BRAND,
  brandDark: BRAND_DARK,
  // Answer-quality categories (keyed by category, not a strict scale).
  // correct/needs-improvement/citation-issue are all "correct" outcomes, so
  // they use a green gradient (dark → medium → light); has answer error=red,
  // harmful=dark red.
  correct: '#2e7d32',
  needsImprovement: '#66bb6a',
  hasError: '#d32f2f',
  hasCitationError: '#a5d6a7',
  harmful: '#b71c1c',
  // Public yes/no feedback
  yes: BRAND,
  no: '#b0bec5',
  // User-feedback sentiment (helpful / not helpful), classified by score
  feedbackPositive: '#2e7d32', // green — kept for fallback / non-breakdown uses
  feedbackNegative: '#c62828', // red  — kept for fallback / non-breakdown uses
  // Per-reason colour scales for the satisfaction breakdown bar. Each group uses
  // five accessible shades (WCAG non-text contrast ≥ 3:1 against white) so
  // individual reasons are visually distinct while staying within their family.
  // Satisfaction breakdown bar scales — 5 GC DS token stops each, dark→light,
  // all meeting WCAG non-text contrast ≥ 3:1 against white.
  // Satisfaction breakdown bar scales — 5 GC DS token stops each, dark→light,
  // all meeting WCAG non-text contrast ≥ 3:1 against white.
  // Greens: green-800 → green-750 → green-700 → green-650 → green-600
  feedbackPositiveScale: ['#14522b', '#196636', '#1f7a40', '#248f4b', '#29a356'],
  // Reds: red-700 → red-600 → red-500 → red-400 → red-350
  feedbackNegativeScale: ['#861322', '#b3192e', '#df2039', '#e64d61', '#e96375'],
  // Neutral fill for empty / no-data states
  empty: '#e0e0e0',
};
