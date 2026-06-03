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
  // Expert-evaluation quality scale (best → worst)
  correct: '#2e7d32',
  needsImprovement: '#f9a825',
  hasError: '#e65100',
  hasCitationError: '#bf360c',
  harmful: '#b71c1c',
  // Public yes/no feedback
  yes: BRAND,
  no: '#b0bec5',
  // Neutral fill for empty / no-data states
  empty: '#e0e0e0',
};

// Quality donut palette, in score order (correct → harmful).
export const QUALITY_COLOURS = [
  COLOURS.correct,
  COLOURS.needsImprovement,
  COLOURS.hasError,
  COLOURS.hasCitationError,
  COLOURS.harmful,
];
