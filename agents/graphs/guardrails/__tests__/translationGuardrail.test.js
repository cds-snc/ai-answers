import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BLOCK_TYPE } from '../blockTypes.js';
import { RedactionError, runPostTranslationGuardrail } from '../index.js';
import ServerLoggingService from '../../../../services/ServerLoggingService.js';

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

  it.each(['ike', 'ikt', 'iku', 'crk', 'ojs', 'moh', 'mic', 'IKE'])(
    'hard-blocks Canadian Indigenous iso3 code "%s" even when it is not literally "und"',
    async (code) => {
      await expect(runPostTranslationGuardrail(
        { originalLanguage: code, translatedText: 'Hello' },
        'chat-1',
        'openai'
      )).rejects.toMatchObject({
        name: 'RedactionError',
        blockType: BLOCK_TYPE.UNSUPPORTED_LANGUAGE,
      });
    }
  );

  // AIA-018: hard-blocked messages are logged as metadata only — never text.
  describe('hard-block logging', () => {
    beforeEach(() => vi.clearAllMocks());

    it.each([
      ['zxx', BLOCK_TYPE.MANIPULATION],
      ['und', BLOCK_TYPE.UNSUPPORTED_LANGUAGE],
      ['crk', BLOCK_TYPE.UNSUPPORTED_LANGUAGE],
    ])('logs language and block type but no text for %s', async (code, blockType) => {
      const originalText = 'TXkgU0lOIGlzIDEyMyA0NTYgNzg5';
      await expect(runPostTranslationGuardrail(
        {
          originalLanguage: code,
          originalText,
          translatedText: 'My SIN is 123 456 789',
          translatedLanguage: 'eng',
        },
        'chat-1',
        'openai'
      )).rejects.toMatchObject({ blockType });

      expect(ServerLoggingService.info).toHaveBeenCalledTimes(1);
      const payload = ServerLoggingService.info.mock.calls[0][2];
      expect(payload).toEqual({
        detectedLanguage: code,
        blockType,
        originalLength: originalText.length,
        translatedLanguage: 'eng',
      });
      expect(JSON.stringify(ServerLoggingService.info.mock.calls)).not.toContain('123 456 789');
    });
  });
});
