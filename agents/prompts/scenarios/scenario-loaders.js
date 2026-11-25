// Static registry of department scenario files, keyed by canonical abbrKey.
//
// This is the ONLY way a department scenario module gets loaded. The
// department string comes from the context agent's LLM output and from
// client-held conversation context, so it must never be used to build a
// module path (AIA-017). Look it up here instead: an unknown key loads nothing.
//
// Used by systemPrompt.js (answer prompt) and api/scenario/scenario-overrides.js
// (admin override editor). Aliased abbrKeys resolve to a canonical key via
// scenario-aliases.js before the lookup, so only canonical keys belong here.
// agents/__tests__/scenario-loaders.test.js fails if a context-* folder has no
// entry here, or an entry here has no folder.
export const SCENARIO_LOADERS = {
  'AAFC-AAC': async () => (await import('./context-aafc-aac/aafc-aac-scenarios.js')).AAFC_AAC_SCENARIOS || '',
  'BAC-LAC': async () => (await import('./context-bac-lac/bac-lac-scenarios.js')).BAC_LAC_SCENARIOS || '',
  'CBSA-ASFC': async () => (await import('./context-cbsa-asfc/cbsa-asfc-scenarios.js')).CBSA_ASFC_SCENARIOS || '',
  'CDS-SNC': async () => (await import('./context-cds-snc/cds-snc-scenarios.js')).CDS_SNC_SCENARIOS || '',
  'CEO-BEC': async () => (await import('./context-ceo-bec/ceo-bec-scenarios.js')).CEO_BEC_SCENARIOS || '',
  'CRA-ARC': async () => (await import('./context-cra-arc/cra-arc-scenarios.js')).CRA_ARC_SCENARIOS || '',
  'DND-MDN': async () => (await import('./context-dnd-mdn/dnd-mdn-scenarios.js')).DND_MDN_SCENARIOS || '',
  'ECCC': async () => (await import('./context-eccc/eccc-scenarios.js')).ECCC_SCENARIOS || '',
  'EDSC-ESDC': async () => (await import('./context-edsc-esdc/edsc-esdc-scenarios.js')).EDSC_ESDC_SCENARIOS || '',
  'FedDev-Ontario': async () => (await import('./context-feddev-ontario/feddev-ontario-scenarios.js')).FEDDEV_ONTARIO_SCENARIOS || '',
  'FedNor': async () => (await import('./context-fednor/fednor-scenarios.js')).FEDNOR_SCENARIOS || '',
  'FIN': async () => (await import('./context-fin/fin-scenarios.js')).FIN_SCENARIOS || '',
  'HC-SC': async () => (await import('./context-hc-sc/hc-sc-scenarios.js')).HC_SC_SCENARIOS || '',
  'IRCC': async () => (await import('./context-ircc/ircc-scenarios.js')).IRCC_SCENARIOS || '',
  'ISED-ISDE': async () => (await import('./context-ised-isde/ised-isde-scenarios.js')).ISED_ISDE_SCENARIOS || '',
  'JUS': async () => (await import('./context-jus/jus-scenarios.js')).JUS_SCENARIOS || '',
  'NRCan-RNCan': async () => (await import('./context-nrcan-rncan/nrcan-rncan-scenarios.js')).NRCAN_RNCAN_SCENARIOS || '',
  'PacifiCan': async () => (await import('./context-pacifican/pacifican-scenarios.js')).PACIFICAN_SCENARIOS || '',
  'PrairiesCan': async () => (await import('./context-prairiescan/prairiescan-scenarios.js')).PRAIRIESCAN_SCENARIOS || '',
  'SAC-ISC': async () => (await import('./context-sac-isc/sac-isc-scenarios.js')).SAC_ISC_SCENARIOS || '',
  'StatCan': async () => (await import('./context-statcan/statcan-scenarios.js')).STATCAN_SCENARIOS || '',
  'TC': async () => (await import('./context-tc/tc-scenarios.js')).TC_SCENARIOS || '',
  'TBS-SCT': async () => (await import('./context-tbs-sct/tbs-sct-scenarios.js')).TBS_SCT_SCENARIOS || '',
  'VAC-ACC': async () => (await import('./context-vac-acc/vac-acc-scenarios.js')).VAC_ACC_SCENARIOS || '',
};

// Exact-key lookup (admin API: the key is stored, so it must be canonical).
// Own-property only: 'constructor' / '__proto__' must not reach Object.prototype.
export const getScenarioLoader = (key) =>
  (typeof key === 'string' && Object.hasOwn(SCENARIO_LOADERS, key)) ? SCENARIO_LOADERS[key] : null;

// Lenient lookup for the answer prompt. The old path-based import lowercased
// the key and turned whitespace into '-', so an LLM answer like 'cra-arc',
// 'NRCAN-RNCAN' or 'CRA ARC' still loaded its scenarios; keep that so the
// allowlist doesn't silently drop them. Safe: the result must be a registered key.
export const normalizeScenarioKey = (key) => key.toLowerCase().replace(/\s+/g, '-');
// findScenarioKey returns the registered (canonical-case) key, or null — for
// callers that need the key itself, e.g. to find a department's other files.
const KEYS_BY_LOWER_KEY = new Map(
  Object.keys(SCENARIO_LOADERS).map((key) => [key.toLowerCase(), key])
);
export const findScenarioKey = (key) =>
  (typeof key === 'string' && KEYS_BY_LOWER_KEY.get(normalizeScenarioKey(key))) || null;
export const findScenarioLoader = (key) => {
  const found = findScenarioKey(key);
  return found ? SCENARIO_LOADERS[found] : null;
};
