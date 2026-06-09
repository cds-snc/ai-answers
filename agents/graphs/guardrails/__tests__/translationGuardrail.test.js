import { describe, expect, it, vi } from 'vitest';
import { BLOCK_TYPE } from '../blockTypes.js';
import { RedactionError, runPostTranslationGuardrail } from '../index.js';

vi.mock('../../../../services/ServerLoggingService.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

describe('translation guardrail', () => {
  it('throws an unsupported-language redaction error for und source language', async () => {
    await expect(runPostTranslationGuardrail(
      { originalLanguage: 'und', translatedText: 'Hello' },
      'chat-1',
      'openai'
    )).rejects.toMatchObject({
      name: 'RedactionError',
      blockType: BLOCK_TYPE.UNSUPPORTED_LANGUAGE,
      redactedText: '#############',
    });

    await expect(runPostTranslationGuardrail(
      { originalLanguage: 'und', translatedText: 'Hello' },
      'chat-1',
      'openai'
    )).rejects.toBeInstanceOf(RedactionError);
  });
});
