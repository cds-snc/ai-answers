import { ChatWorkflowService } from '../ChatWorkflowService.js';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// We'll mock the global fetch to simulate the translation API endpoint responses
const originalFetch = global.fetch;

describe('ChatWorkflowService.translateQuestion', () => {
  beforeEach(() => {
  // Default fetch should succeed for background logging calls; tests will override the first call when needed
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}), text: async () => '' });
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.resetAllMocks();
  });

  it('returns parsed translation JSON on success', async () => {
  const mockResp = { originalLanguage: 'eng', translatedLanguage: 'fra', translatedText: 'Bonjour', noTranslation: false, originalText: 'Hello' };
  global.fetch.mockResolvedValueOnce({ ok: true, json: async () => mockResp });

  const result = await ChatWorkflowService.translateQuestion('Hello', 'fra', 'openai');
  expect(result).toEqual(mockResp);
  });

  it('returns noTranslation object with iso3 originalLanguage on no-op', async () => {
  const mockResp = { noTranslation: true, originalLanguage: 'eng', originalText: 'Hello', translatedLanguage: 'eng', translatedText: 'Hello' };
  global.fetch.mockResolvedValueOnce({ ok: true, json: async () => mockResp });

  const result = await ChatWorkflowService.translateQuestion('Hello', 'eng', 'openai');
  expect(result).toEqual(mockResp);
  });

  it('throws on API failure', async () => {
    global.fetch.mockResolvedValueOnce({ ok: false, status: 500, text: async () => 'server error' });

    await expect(ChatWorkflowService.translateQuestion('Hello', 'fra', 'openai')).rejects.toThrow();
  });
});
