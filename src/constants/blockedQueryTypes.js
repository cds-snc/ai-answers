// Display order of the blocked-query guardrail buckets, shared by the dashboard
// components. Ordered roughly by where each guardrail fires in the pipeline:
// length check → privacy (programmatic then AI) → word lists → Azure → language.
// The matching labels live under the `blockedQueries.types.*` locale keys.
export const BLOCK_QUERY_TYPES = [
  'tooShort',
  'piStage1',
  'piStage2',
  'profanity',
  'threat',
  'manipulation',
  'azureGuardrail',
  'unsupportedLanguage',
];

// Display grouping for the exec + partner card dashboards, which report the two
// privacy guardrails (programmatic and AI detection) as a single "Private
// details" bucket — which stage caught the query is an implementation detail to
// those audiences. The technical dashboard keeps the raw per-type rows above so
// the guardrails stay debuggable. Storage and the metrics API are unaffected:
// this is a display-only merge, summed in `buildBlockedBarData`.
export const BLOCK_QUERY_GROUPS = [
  { key: 'tooShort', types: ['tooShort'] },
  { key: 'privateDetails', types: ['piStage1', 'piStage2'] },
  { key: 'profanity', types: ['profanity'] },
  { key: 'threat', types: ['threat'] },
  { key: 'manipulation', types: ['manipulation'] },
  { key: 'azureGuardrail', types: ['azureGuardrail'] },
  { key: 'unsupportedLanguage', types: ['unsupportedLanguage'] },
];

export default BLOCK_QUERY_TYPES;
