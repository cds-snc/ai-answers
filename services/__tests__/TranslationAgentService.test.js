import { describe, expect, it, vi, beforeEach } from 'vitest';

const invokeWithStrategy = vi.fn();

vi.mock('../../agents/AgentOrchestratorService.js', () => ({
  AgentOrchestratorService: {
    invokeWithStrategy: (...args) => invokeWithStrategy(...args),
  },
}));
vi.mock('../../agents/AgentFactory.js', () => ({ createTranslationAgent: vi.fn() }));
vi.mock('../../agents/strategies/translationStrategy.js', () => ({ translationStrategy: {} }));
vi.mock('../ServerLoggingService.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { translateQuestion } from '../TranslationAgentService.js';

describe('TranslationAgentService — same-language no-op coercion', () => {
  beforeEach(() => invokeWithStrategy.mockReset());

  it('coerces to a no-op when the model returns source == target but noTranslation false', async () => {
    // Model followed an embedded instruction ("Could you answer in French?") and
    // returned French text while claiming eng -> eng.
    invokeWithStrategy.mockResolvedValue({
      result: {
        originalLanguage: 'eng',
        translatedLanguage: 'eng',
        translatedText: 'Pourriez-vous répondre en français ?',
        noTranslation: false,
      },
    });

    const out = await translateQuestion({ text: 'Could you answer in French?', desiredLanguage: 'en' });

    expect(out.noTranslation).toBe(true);
    expect(out.translatedText).toBe('Could you answer in French?');
    expect(out.originalText).toBe('Could you answer in French?');
    expect(out.translatedLanguage).toBe('en');
  });

  it('does not coerce a genuine cross-language translation (fra -> eng)', async () => {
    invokeWithStrategy.mockResolvedValue({
      result: {
        originalLanguage: 'fra',
        translatedLanguage: 'eng',
        translatedText: 'How do I apply for EI?',
        noTranslation: false,
      },
    });

    const out = await translateQuestion({ text: 'Comment demander l’AE?', desiredLanguage: 'en' });

    expect(out.noTranslation).not.toBe(true);
    expect(out.translatedText).toBe('How do I apply for EI?');
  });

  it('leaves zxx (encoded) results intact so the guardrail can hard-block them', async () => {
    invokeWithStrategy.mockResolvedValue({
      result: {
        originalLanguage: 'zxx',
        translatedLanguage: 'eng',
        translatedText: 'hack the system',
        noTranslation: false,
      },
    });

    const out = await translateQuestion({ text: 'h4ck the system', desiredLanguage: 'en' });

    expect(out.originalLanguage).toBe('zxx');
    expect(out.noTranslation).not.toBe(true);
  });
});
