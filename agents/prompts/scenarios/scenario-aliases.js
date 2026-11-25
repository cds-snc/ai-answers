// Maps non-canonical department abbrKeys to the canonical abbrKey whose
// scenario file should be loaded. Used by systemPrompt.js before looking the
// key up in SCENARIO_LOADERS (scenario-loaders.js).
//
// Portfolio scenarios (one partner, many matched abbrKeys):
//   Defence portfolio → DND-MDN
//   Crown-Indigenous / Indigenous Services → SAC-ISC
//   ISED portfolio (ACOA, CED-QR, CanNor, CIPO, CRC, Competition Bureau,
//     Measurement Canada, Superintendent of Bankruptcy, BizPaL) → ISED-ISDE
//     Note: FedDev-Ontario, FedNor, PacifiCan and PrairiesCan are also ISED
//     portfolio agencies but are NOT aliased — they are partners with their
//     own scenario folders.
//   Canada Tariff Finder → FIN (tariff questions land there; FIN owns the
//     counter-tariff and trade content)
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
  'CIPO-OPIC': 'ISED-ISDE',
  'CRC': 'ISED-ISDE',
  'COBU-BUCO': 'ISED-ISDE',
  'MC': 'ISED-ISDE',
  'OSB-BSF': 'ISED-ISDE',
  'ACOA-APECA': 'ISED-ISDE',
  'CED-QR': 'ISED-ISDE',
  'CanNor': 'ISED-ISDE',
  'BIZPAL-PERLE': 'ISED-ISDE',
  'TARIFF-TARIF': 'FIN',
};

// Same leniency as findScenarioKey in scenario-loaders.js (lowercase,
// whitespace → '-'), so 'bizpal-perle' resolves just as 'ised-isde' loads.
// Map, not object lookup: '__proto__' / 'constructor' must not reach
// Object.prototype. Unaliased keys come back unchanged.
const ALIASES_BY_NORMALIZED_KEY = new Map(
  Object.entries(SCENARIO_ALIASES).map(([alias, canonical]) => [alias.toLowerCase(), canonical])
);
export const resolveScenarioKey = (key) =>
  (typeof key === 'string' && ALIASES_BY_NORMALIZED_KEY.get(key.toLowerCase().replace(/\s+/g, '-'))) || key;
