import { describe, it, expect, vi, beforeEach } from 'vitest';

// Ensure module cache is reset so our doMock() calls apply correctly
vi.resetModules();

// Mocks for services used by DefaultWithVector. Paths are relative to this test file.
const mockDeriveContext = vi.fn();
const mockDetermineOutputLang = vi.fn();
vi.doMock('../../services/ContextService.js', () => ({
  default: { deriveContext: mockDeriveContext, determineOutputLang: mockDetermineOutputLang }
}));

const mockSendMessage = vi.fn();
const mockParseSentences = vi.fn(() => []);
vi.doMock('../../services/AnswerService.js', () => ({
  default: { sendMessage: mockSendMessage, parseSentences: mockParseSentences }
}));

const mockPersistInteraction = vi.fn();
vi.doMock('../../services/DataStoreService.js', () => ({
  default: { persistInteraction: mockPersistInteraction }
}));

const mockInfo = vi.fn();
vi.doMock('../../services/ClientLoggingService.js', () => ({
  default: { info: mockInfo }
}));

const mockGetApiUrl = vi.fn(() => 'http://local/api');
vi.doMock('../../utils/apiToUrl.js', () => ({ getApiUrl: mockGetApiUrl }));

// Minimal ChatWorkflowService mock used by processResponse
const mockSendStatusUpdate = vi.fn();
const mockValidateShortQueryOrThrow = vi.fn();
const mockProcessRedaction = vi.fn(async (text) => ({ redactedText: text }));
const mockBuildTranslationContext = vi.fn(() => ({}));
const mockTranslateQuestion = vi.fn(async (t) => ({ translatedText: t, originalLanguage: 'en' }));
const mockVerifyCitation = vi.fn(async () => ({ url: null, fallbackUrl: null, confidenceRating: null }));
vi.doMock('../../services/ChatWorkflowService.js', () => ({
  ChatWorkflowService: {
    sendStatusUpdate: mockSendStatusUpdate,
    validateShortQueryOrThrow: mockValidateShortQueryOrThrow,
    processRedaction: mockProcessRedaction,
    buildTranslationContext: mockBuildTranslationContext,
    translateQuestion: mockTranslateQuestion,
    verifyCitation: mockVerifyCitation,
  },
  WorkflowStatus: { MODERATING_QUESTION: 'mod', GENERATING_ANSWER: 'gen', VERIFYING_CITATION: 'verify', NEED_CLARIFICATION: 'clar' }
}));

vi.doMock('../../services/AuthService.js', () => ({ default: { fetch: vi.fn() } }));

// We'll dynamically import the module inside each test after mocks are registered

describe('DefaultWithVector similar-answer gating', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // Default behavior for deriveContext and sendMessage to allow flow to complete
    mockDeriveContext.mockResolvedValue({});
    mockSendMessage.mockResolvedValue({ answerType: 'normal', citationUrl: null, content: 'ok' });
  });

  it('calls checkSimilarAnswer when there is NO prior AI reply', async () => {
    const { DefaultWithVector } = await import('../DefaultWithVector.js');
    const instance = new DefaultWithVector();

    // Spy on the instance method
    const spy = vi.spyOn(instance, 'checkSimilarAnswer').mockResolvedValue(null);

    const conversationHistory = [
      { sender: 'user', text: 'Hello' }
    ];

    await instance.processResponse('chat1', 'How are you?', 'msg1', conversationHistory, 'en', null, null, 'openai', null, () => {}, 'vector');

    expect(spy).toHaveBeenCalled();
  });

  it('does NOT call checkSimilarAnswer when there IS a prior AI reply', async () => {
    const { DefaultWithVector } = await import('../DefaultWithVector.js');
    const instance = new DefaultWithVector();

    const spy = vi.spyOn(instance, 'checkSimilarAnswer').mockResolvedValue(null);

    const conversationHistory = [
      { sender: 'user', text: 'Hello' },
      { sender: 'ai', interaction: { answer: { content: 'previous answer' } } }
    ];

    await instance.processResponse('chat1', 'How are you?', 'msg1', conversationHistory, 'en', null, null, 'openai', null, () => {}, 'vector');

    expect(spy).not.toHaveBeenCalled();
  });
});
