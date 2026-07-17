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
  // harmful=dark red. GC DS tokens; all ≥ 3:1 non-text contrast against white.
  correct: '#1f7a40',          // custom scale: between --gcds-color-green-500 (#289f58, 3:1) and green-700 (#03662a, 7:1) — ~5.1:1
  needsImprovement: '#66bb6a', // lighter fill — paired with qualityBorder stroke for WCAG
  hasError: '#d3080c',         // --gcds-color-red-500, 3:1 contrast
  hasCitationError: '#a5d6a7', // lightest fill — paired with qualityBorder stroke for WCAG
  harmful: '#b71c1c',
  qualityBorder: '#29a356',    // green-600 ~3.25:1 — lightest passing stroke on lighter quality-bar fills
  // Public yes/no feedback
  yes: BRAND,
  no: '#b0bec5',
  // User-feedback sentiment (helpful / not helpful), classified by score
  feedbackPositive: '#1f7a40', // green-700 — kept for fallback / non-breakdown uses
  feedbackNegative: '#c62828', // red  — kept for fallback / non-breakdown uses
  // Satisfaction donut — lightest scale green (with border) + mid-scale red
  satisfactionPositive: '#1f7a40',                              // matches COLOURS.correct
  satisfactionNegative: '#d3080c',                              // matches COLOURS.hasError
  // Per-reason colour scales for the satisfaction breakdown bar. Each group uses
  // five accessible shades (WCAG non-text contrast ≥ 3:1 against white) so
  // individual reasons are visually distinct while staying within their family.
  // Satisfaction breakdown bar scales — dark→light. Each entry is { fill, stroke? }.
  // Stops with fill contrast ≥ 3:1 against white need no stroke. Lighter stops
  // carry a stroke (green-600, the lightest passing value at ~3.25:1) to meet WCAG.
  feedbackPositiveScale: [
    { fill: '#196636' },                      // green-750 ~5.7:1
    { fill: '#1f7a40' },                      // green-700 ~5.1:1
    { fill: '#248f4b' },                      // green-650 ~3.79:1
    { fill: '#29a356' },                      // green-600 ~3.25:1
    { fill: '#2eb860', stroke: '#29a356' },   // green-550 ~2.4:1, stroke meets 3:1
  ],
  // Reds: red-700 → red-600 → red-500 → red-400 → red-350
  feedbackNegativeScale: ['#861322', '#b3192e', '#df2039', '#e64d61', '#e96375'],
  // Neutral fill for empty / no-data states
  empty: '#e0e0e0',
};
