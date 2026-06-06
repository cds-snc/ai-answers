// Display order of the blocked-query guardrail buckets, shared by the dashboard
// components. Mirrors BLOCK_TYPES in services/BlockedQueryService.js (kept as a
// separate frontend copy because React code can't import from server-side
// services). The matching labels live under the `blockedQueries.types.*` locale
// keys.
export const BLOCK_QUERY_TYPES = [
  'tooShort',
  'threat',
  'manipulation',
  'profanity',
  'piStage1',
  'piStage2',
  'azureGuardrail',
  'unsupportedLanguage',
];

export default BLOCK_QUERY_TYPES;
