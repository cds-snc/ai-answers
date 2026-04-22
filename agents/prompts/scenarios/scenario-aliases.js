// Maps non-canonical department abbrKeys to the canonical abbrKey whose
// scenario file should be loaded. Used by systemPrompt.js before the
// dynamic import of context-{dept}/{dept}-scenarios.js.
//
// Portfolio scenarios (one partner, many matched abbrKeys):
//   Defence portfolio → DND-MDN
//   Crown-Indigenous / Indigenous Services → SAC-ISC
export const SCENARIO_ALIASES = {
  'CFHA-ALFC': 'DND-MDN',
  'DCC-CDC': 'DND-MDN',
  'DIA-AID': 'DND-MDN',
  'DRDC-RDDC': 'DND-MDN',
  'IRPDA-CIEAD': 'DND-MDN',
  'ONDCAF': 'DND-MDN',
  'RCAANC-CIRNAC': 'SAC-ISC',
};

export const resolveScenarioKey = (key) => SCENARIO_ALIASES[key] || key;
