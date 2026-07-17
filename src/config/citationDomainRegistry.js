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
  'statcan.gc.ca': {
    en: 'Statistics Canada',
    fr: 'Statistique Canada',
  },
  // Add further GC domains here as they appear in citation results.
  // Each entry needs both 'en' and 'fr' department names.
  // Registry entries serve two purposes:
  //   Tier 1 enhancement — when a readable slug is found on a department domain,
  //     the dept name is prepended: "Statistics Canada — The Daily — …"
  //   Tier 2 fallback — when the path is fully opaque/numeric, the dept name is
  //     used alone: "Government of Canada — Statistics Canada — …"
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
