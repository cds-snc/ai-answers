// Bilingual registry of known GC hostnames to their department names.
// Used by buildAriaLabel (src/utils/citationAriaLabel.js) as a Tier 2 fallback
// when URL path segments are opaque or numeric.
// Add entries here as new high-traffic domains appear in citation results.
export const DOMAIN_REGISTRY = {
  'canada.ca': {
    en: 'Government of Canada',
    fr: 'Gouvernement du Canada',
  },
  'sac-isc.gc.ca': {
    en: 'Indigenous Services Canada',
    fr: 'Services aux Autochtones Canada',
  },
  // Add further GC domains here as they appear in citation results.
  // Each entry needs both 'en' and 'fr' department names.
  // Only needed for domains with opaque or numeric URL paths — domains with
  // readable slugs (e.g. travel.gc.ca) are handled automatically by Tier 1.
};

// Slug registry — optional extension for Tier 1.
//
// The generic slug converter (sentence case, hyphens → spaces) works well for
// most GC URLs but cannot recover conjunctions, commas, or acronyms that were
// dropped when the URL slug was created. If a high-traffic slug produces a
// misleading or incomplete label, add it here and check it in extractSlugLabel
// before falling back to the generic conversion.
//
// Example entry (not yet wired up — add import + lookup in citationAriaLabel.js
// when the first real case warrants it):
//
// export const SLUG_REGISTRY = {
//   'immigration-refugees-citizenship': {
//     en: 'Immigration, Refugees and Citizenship',
//     fr: 'Immigration, Réfugiés et Citoyenneté',
//   },
// };
