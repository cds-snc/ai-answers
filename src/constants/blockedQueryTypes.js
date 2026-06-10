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

export default BLOCK_QUERY_TYPES;
