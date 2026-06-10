export const BLOCK_TYPE = {
  TOO_SHORT: 'tooShort',
  THREAT: 'threat',
  MANIPULATION: 'manipulation',
  PROFANITY: 'profanity',
  PI_STAGE_1: 'piStage1',
  PI_STAGE_2: 'piStage2',
  AZURE_GUARDRAIL: 'azureGuardrail',
  UNSUPPORTED_LANGUAGE: 'unsupportedLanguage',
};

// Display order for blocked-query metrics. Keep this shared with any code that
// throws guardrail errors so the dashboard and graph use one vocabulary.
export const BLOCK_TYPES = [
  BLOCK_TYPE.TOO_SHORT,
  BLOCK_TYPE.THREAT,
  BLOCK_TYPE.MANIPULATION,
  BLOCK_TYPE.PROFANITY,
  BLOCK_TYPE.PI_STAGE_1,
  BLOCK_TYPE.PI_STAGE_2,
  BLOCK_TYPE.AZURE_GUARDRAIL,
  BLOCK_TYPE.UNSUPPORTED_LANGUAGE,
];
