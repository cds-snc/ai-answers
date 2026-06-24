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



};
