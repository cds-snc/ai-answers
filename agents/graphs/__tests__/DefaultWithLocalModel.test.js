import { beforeEach, describe, expect, it, vi } from 'vitest';
import { graphRequestContext } from '../requestContext.js';

const { helper } = vi.hoisted(() => ({
  helper: {
    validateShortQuery: vi.fn(), processRedaction: vi.fn(), translateQuestion: vi.fn(), postTranslateGuard: vi.fn(),
    buildTranslationContext: vi.fn(), checkSimilarAnswer: vi.fn(), buildShortCircuitPayload: vi.fn(),
    deriveContext: vi.fn(), sendAnswerRequest: vi.fn(), verifyCitation: vi.fn(), persistInteraction: vi.fn(),
  },
}));

vi.mock('../workflows/GraphWorkflowHelper.js', () => ({ GraphWorkflowHelper: vi.fn(function GraphWorkflowHelper() { return helper; }) }));
vi.mock('../GraphEventLogger.js', () => ({ logGraphEvent: vi.fn() }));
vi.mock('../../../services/ServerLoggingService.js', () => ({ default: { info: vi.fn(), error: vi.fn() } }));

describe('DefaultWithLocalModel workflow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    helper.processRedaction.mockResolvedValue({ redactedText: 'redacted' });
    helper.translateQuestion.mockResolvedValue({ translatedText: 'translated', originalLanguage: 'en' });
    helper.deriveContext.mockResolvedValue({ topic: 'topic', department: 'dept' });
    helper.sendAnswerRequest.mockResolvedValue({ answerType: 'normal', content: 'generated', citationUrl: 'https://example.com' });
    helper.verifyCitation.mockResolvedValue({ url: 'https://example.com' });
    vi.spyOn(graphRequestContext, 'getStore').mockReturnValue({ user: { userId: 'user' } });
  });

  it('reuses and persists a confirmed first-turn answer', async () => {
    helper.checkSimilarAnswer.mockResolvedValue({ answer: { answerType: 'normal', content: 'reused', historySignature: 'sig' }, citationUrl: 'https://example.com' });
    helper.buildShortCircuitPayload.mockReturnValue({ answer: { answerType: 'normal', content: 'reused', historySignature: 'sig' }, context: null, finalCitationUrl: 'https://example.com' });
    const { defaultWithLocalModelApp } = await import('../DefaultWithLocalModel.js');
    const result = await defaultWithLocalModelApp.invoke({ chatId: 'chat', userMessage: 'question', conversationHistory: [], lang: 'en', selectedAI: 'openai' });
    expect(result.result.answer.content).toBe('reused');
    expect(helper.persistInteraction).toHaveBeenCalledWith(expect.objectContaining({ workflow: 'DefaultWithLocalModel' }), expect.anything());
    expect(helper.deriveContext).not.toHaveBeenCalled();
  });

  it('uses Generic behavior when there is prior history', async () => {
    const { defaultWithLocalModelApp } = await import('../DefaultWithLocalModel.js');
    await defaultWithLocalModelApp.invoke({ chatId: 'chat', userMessage: 'follow up', conversationHistory: [{ sender: 'user', text: 'earlier' }], lang: 'en', selectedAI: 'openai' });
    expect(helper.checkSimilarAnswer).not.toHaveBeenCalled();
    expect(helper.deriveContext).toHaveBeenCalled();
  });

  it('carries rejected short-circuit debug data into the normal answer flow', async () => {
    helper.checkSimilarAnswer.mockResolvedValue({
      debugPayload: {
        shortCircuit: false,
        reason: 'llm-rejected',
        vectorMatches: [{ interactionId: 'vector-1' }],
        nlpCandidates: [{ interactionId: 'nlp-1' }],
        llmSelection: { accepted: false, results: [{ recommendation: 'reject' }] },
      },
    });

    const { defaultWithLocalModelApp } = await import('../DefaultWithLocalModel.js');
    const result = await defaultWithLocalModelApp.invoke({
      chatId: 'chat', userMessage: 'question', conversationHistory: [], lang: 'en', selectedAI: 'openai'
    });

    expect(result.shortCircuitDebugPayload).toEqual(expect.objectContaining({
      reason: 'llm-rejected',
      vectorMatches: expect.any(Array),
      nlpCandidates: expect.any(Array),
      llmSelection: expect.objectContaining({ accepted: false }),
    }));
    expect(result.result.answer.content).toBe('generated');
  });
});
