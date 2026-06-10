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
  feedbackPositiveScale: ['#1b5e20', '#2e7d32', '#2d6a4f', '#388e3c', '#43a047'],
  feedbackNegativeScale: ['#b71c1c', '#c62828', '#c0392b', '#d32f2f', '#e53935'],
  // Neutral fill for empty / no-data states
  empty: '#e0e0e0',
};
