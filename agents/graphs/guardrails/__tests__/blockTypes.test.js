import { describe, expect, it } from 'vitest';
import { BLOCK_TYPE, BLOCK_TYPES } from '../blockTypes.js';

describe('guardrail block types', () => {
  it('defines the shared blocked-query vocabulary in display order', () => {
    expect(BLOCK_TYPES).toEqual([
      BLOCK_TYPE.TOO_SHORT,
      BLOCK_TYPE.THREAT,
      BLOCK_TYPE.MANIPULATION,
      BLOCK_TYPE.PROFANITY,
      BLOCK_TYPE.PI_STAGE_1,
      BLOCK_TYPE.PI_STAGE_2,
      BLOCK_TYPE.AZURE_GUARDRAIL,
      BLOCK_TYPE.UNSUPPORTED_LANGUAGE,
    ]);
  });
});
