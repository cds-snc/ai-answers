// Maps non-canonical department abbrKeys to the canonical abbrKey whose
// scenario file should be loaded. Used by systemPrompt.js before the
// dynamic import of context-{dept}/{dept}-scenarios.js.
//
// Portfolio scenarios (one partner, many matched abbrKeys):
//   Defence portfolio → DND-MDN
//   Crown-Indigenous / Indigenous Services → SAC-ISC
//   Regional Development Agencies → ISED-ISDE
//   Public Health Agency → HC-SC
//   Agriculture portfolio → AAFC-AAC
export const SCENARIO_ALIASES = {
  'AGPAL': 'AAFC-AAC',
  'PHAC-ASPC': 'HC-SC',
  'CFHA-ALFC': 'DND-MDN',
  'DCC-CDC': 'DND-MDN',
  'DIA-AID': 'DND-MDN',
  'DRDC-RDDC': 'DND-MDN',
  'IRPDA-CIEAD': 'DND-MDN',
  'ONDCAF': 'DND-MDN',
  'RCAANC-CIRNAC': 'SAC-ISC',
  'ACOA-APECA': 'ISED-ISDE',
  'CED-QR': 'ISED-ISDE',
  'CanNor': 'ISED-ISDE',
  'FedDev Ontario': 'ISED-ISDE',
  'FedNor': 'ISED-ISDE',
  'PacifiCan': 'ISED-ISDE',
  'PrairiesCan': 'ISED-ISDE',
};

export const resolveScenarioKey = (key) => SCENARIO_ALIASES[key] || key;
