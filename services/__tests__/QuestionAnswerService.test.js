import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import QuestionAnswerService from '../QuestionAnswerService.js';

// Helpers to build chainable query mocks
function createChainableQuery(resolvedValue) {
  const api = {
    select: vi.fn(() => api),
    populate: vi.fn(() => api),
    lean: vi.fn(async () => resolvedValue),
  };
  return api;
}

// Hoisting mocks so they're initialized before VectorServiceFactory and InteractionPersistenceService accesses them
// initVectorService is hoisted to fix flakiness with vi.clearAllMocks() wiping the mock implementation during tests and being undefined
const { mockMatchQuestions, mockInteractionFind, mockChatFindOne, mockChatFind, mockInitVectorService } = vi.hoisted(() => ({
    mockMatchQuestions: vi.fn(),
    mockInteractionFind: vi.fn(),
    mockChatFindOne: vi.fn(),
    mockChatFind: vi.fn(),
    mockInitVectorService: vi.fn(),
}));

// Mocks
vi.mock('../../api/db/db-connect.js', () => ({
  default: vi.fn().mockResolvedValue(),
}));

vi.mock('../VectorServiceFactory.js', () => ({
    initVectorService: mockInitVectorService // value applied in beforeEach, clearAllMocks wipes it
}));

// Model mocks (Interaction, Answer, ExpertFeedback, Question, Chat)
vi.mock('../../models/interaction.js', () => ({
  Interaction: { find: mockInteractionFind },
}));
vi.mock('../../models/answer.js', () => ({ Answer: {} }));
vi.mock('../../models/expertFeedback.js', () => ({ ExpertFeedback: {} }));
vi.mock('../../models/question.js', () => ({ Question: {} }));
vi.mock('../../models/chat.js', () => ({
  Chat: { findOne: mockChatFindOne, find: mockChatFind },
}));

// Silence logging in tests
vi.mock('../ServerLoggingService.js', () => ({
  default: { error: vi.fn(), warn: vi.fn() },
}));

describe('QuestionAnswerService', () => {
  beforeEach(() => {
    vi.resetModules();
    mockMatchQuestions.mockReset();
    mockInteractionFind.mockReset();
    mockChatFindOne.mockReset();
    mockChatFind.mockReset();
    mockInitVectorService.mockResolvedValue({ matchQuestions: mockMatchQuestions }); // Re-apply after clearAllMocks wipes it
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns formatted similar questions including score, feedback, citation, and flow', async () => {
    // Arrange hits from vector search
    mockMatchQuestions.mockResolvedValue([[{
      interactionId: 'i1',
      expertFeedbackId: 'ef1',
      expertFeedbackRating: 80,
      similarity: 0.9,
    }]]);

    // Mock Interaction.find chain
    const interactionDocs = [{
      _id: 'i1',
      question: { redactedQuestion: 'How to apply for benefit?' },
      answer: { content: 'You can apply online via GC portal.', citation: { providedCitationUrl: 'https://example.gc.ca' } },
      expertFeedback: {
        totalScore: 80,
        sentence1Score: 70,
        sentence1Explanation: 'Too vague',
        sentence1Harmful: false,
        sentence1ContentIssue: true,
        citationScore: 20,
        citationExplanation: 'Wrong citation used',
        expertCitationUrl: 'https://expert.example.gc.ca',
        answerImprovement: 'Mention eligibility first',
        feedback: 'Use a better source next time',
        createdAt: new Date(),
      },
    }];
    mockInteractionFind.mockReturnValue(createChainableQuery(interactionDocs));

    // Mock Chat.findOne to build question flow
    mockChatFindOne.mockReturnValue({
      populate: () => ({
        lean: async () => ({
          interactions: [
            { _id: 'prev1', question: { redactedQuestion: 'Initial question' } },
            { _id: 'i1', question: { redactedQuestion: 'How to apply for benefit?' } },
          ],
        }),
      }),
    });

    // Act
    const result = await QuestionAnswerService.getSimilarQuestionsContext('benefits', { k: 3, includeQuestionFlow: true });

    // Assert
    expect(result).toContain('Q: How to apply for benefit?');
    expect(result).toContain('Flow: Question 1: Initial question');
    expect(result).toContain('A: You can apply online via GC portal.');
    expect(result).toContain('Score: 80/100');
    expect(result).toContain('S1: score=70');
    expect(result).toContain('content-issue');
    expect(result).toContain('Citation: score=20');
    expect(result).toContain('correct-url=https://expert.example.gc.ca');
    expect(result).toContain('Improvement: Mention eligibility first');
    expect(result).toContain('Overall: Use a better source next time');
    expect(result).toContain('Citation: https://example.gc.ca');
  });

  it('returns debug data with chatIds, similarity, and pre-threshold text when requested', async () => {
    mockMatchQuestions.mockResolvedValue({
      results: [[{
        interactionId: 'i1',
        expertFeedbackId: 'ef1',
        similarity: 0.91,
      }]],
      debug: [[
        {
          interactionId: 'i1',
          expertFeedbackId: 'ef1',
          similarity: 0.91,
        },
        {
          interactionId: 'i2',
          expertFeedbackId: 'ef2',
          similarity: 0.74,
        },
      ]],
    });

    mockInteractionFind.mockReturnValue(createChainableQuery([
      {
        _id: 'i1',
        question: { redactedQuestion: 'Matched Q?' },
        answer: { content: 'Matched A.' },
        expertFeedback: { totalScore: 80, createdAt: new Date(), neverStale: false },
      },
      {
        _id: 'i2',
        question: { redactedQuestion: 'Below threshold Q?' },
        answer: { content: 'Below threshold A.' },
        expertFeedback: { totalScore: 80, createdAt: new Date(), neverStale: false },
      },
    ]));

    mockChatFindOne.mockReturnValue({
      populate: () => ({
        lean: async () => ({
          interactions: [
            { _id: 'i1', question: { redactedQuestion: 'Matched Q?' } },
            { _id: 'i2', question: { redactedQuestion: 'Below threshold Q?' } },
          ],
        }),
      }),
    });
    mockChatFind.mockReturnValue({
      select: () => ({
        lean: async () => [
          { chatId: 'chat-1', interactions: ['i1'] },
          { chatId: 'chat-2', interactions: ['i2'] },
        ],
      }),
    });

    const result = await QuestionAnswerService.getSimilarQuestionsContext('benefits', {
      k: 3,
      includeQuestionFlow: false,
      returnDebugData: true,
    });

    expect(result).toMatchObject({
      text: expect.stringContaining('Q: Matched Q?'),
      debug: {
        matchedRecords: [
          expect.objectContaining({
            interactionId: 'i1',
            chatId: 'chat-1',
            similarity: 0.91,
            questionText: 'Matched Q?',
          }),
        ],
        preThresholdRecords: [
          expect.objectContaining({
            interactionId: 'i1',
            similarity: 0.91,
            questionText: 'Matched Q?',
          }),
          expect.objectContaining({
            interactionId: 'i2',
            similarity: 0.74,
            questionText: 'Below threshold Q?',
          }),
        ],
      },
    });
  });

  it('returns empty string when no matches are found', async () => {
    mockMatchQuestions.mockResolvedValue([[]]);
    mockInteractionFind.mockReturnValue(createChainableQuery([]));
    mockChatFindOne.mockReturnValue({ populate: () => ({ lean: async () => null }) });

    const result = await QuestionAnswerService.getSimilarQuestionsContext('benefits');
    expect(result).toBe('');
  });

  it('does not over-fetch when denormalized pre-filtering is enabled', async () => {
    mockMatchQuestions.mockResolvedValue([[]]);
    mockInteractionFind.mockReturnValue(createChainableQuery([]));

    const result = await QuestionAnswerService.getSimilarQuestionsContext('benefits', {
      k: 3,
      useDenormalizedPreFilter: true,
      recencyDays: 365,
    });

    expect(result).toBe('');
    expect(mockMatchQuestions).toHaveBeenCalledWith(['benefits'], expect.objectContaining({
      k: 3,
      recencyDays: 365,
      useDenormalizedPreFilter: true,
    }));
  });

  it('keeps legacy over-fetching when denormalized pre-filtering is disabled', async () => {
    mockMatchQuestions.mockResolvedValue([[]]);
    mockInteractionFind.mockReturnValue(createChainableQuery([]));

    const result = await QuestionAnswerService.getSimilarQuestionsContext('benefits', {
      k: 3,
      useDenormalizedPreFilter: false,
    });

    expect(result).toBe('');
    expect(mockMatchQuestions).toHaveBeenCalledWith(['benefits'], expect.objectContaining({
      k: 9,
      useDenormalizedPreFilter: false,
    }));
  });

  it('drops hits whose expertFeedback.createdAt is older than recencyDays', async () => {
    const recentDate = new Date();
    const staleDate = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000); // 400 days old

    mockMatchQuestions.mockResolvedValue([[
      { interactionId: 'stale', expertFeedbackId: 'ef-stale', similarity: 0.95 },
      { interactionId: 'fresh', expertFeedbackId: 'ef-fresh', similarity: 0.90 },
    ]]);

    mockInteractionFind.mockReturnValue(createChainableQuery([
      {
        _id: 'stale',
        question: { redactedQuestion: 'Stale Q?' },
        answer: { content: 'Stale A.' },
        expertFeedback: { totalScore: 80, createdAt: staleDate, neverStale: false },
      },
      {
        _id: 'fresh',
        question: { redactedQuestion: 'Fresh Q?' },
        answer: { content: 'Fresh A.' },
        expertFeedback: { totalScore: 80, createdAt: recentDate, neverStale: false },
      },
    ]));

    mockChatFindOne.mockReturnValue({ populate: () => ({ lean: async () => null }) });

    const result = await QuestionAnswerService.getSimilarQuestionsContext('benefits', {
      k: 3,
      recencyDays: 365,
      includeQuestionFlow: false,
    });

    expect(result).toContain('Q: Fresh Q?');
    expect(result).not.toContain('Q: Stale Q?');
  });

  it('drops hits with missing or unparseable expertFeedback.createdAt (treats unknown age as stale)', async () => {
    mockMatchQuestions.mockResolvedValue([[
      { interactionId: 'no-date', expertFeedbackId: 'ef-no-date', similarity: 0.95 },
      { interactionId: 'bad-date', expertFeedbackId: 'ef-bad-date', similarity: 0.90 },
    ]]);

    mockInteractionFind.mockReturnValue(createChainableQuery([
      {
        _id: 'no-date',
        question: { redactedQuestion: 'Missing date Q?' },
        answer: { content: 'Missing date A.' },
        expertFeedback: { totalScore: 80, neverStale: false }, // no createdAt at all
      },
      {
        _id: 'bad-date',
        question: { redactedQuestion: 'Bad date Q?' },
        answer: { content: 'Bad date A.' },
        expertFeedback: { totalScore: 80, createdAt: 'not-a-date', neverStale: false },
      },
    ]));

    mockChatFindOne.mockReturnValue({ populate: () => ({ lean: async () => null }) });

    const result = await QuestionAnswerService.getSimilarQuestionsContext('benefits', {
      k: 3,
      recencyDays: 365,
      includeQuestionFlow: false,
    });

    expect(result).not.toContain('Missing date Q?');
    expect(result).not.toContain('Bad date Q?');
    expect(result).toBe('');
  });

  it('keeps a stale hit when expertFeedback.neverStale is true', async () => {
    const staleDate = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000);

    mockMatchQuestions.mockResolvedValue([[
      { interactionId: 'evergreen', expertFeedbackId: 'ef-ever', similarity: 0.95 },
    ]]);

    mockInteractionFind.mockReturnValue(createChainableQuery([
      {
        _id: 'evergreen',
        question: { redactedQuestion: 'Evergreen Q?' },
        answer: { content: 'Evergreen A.' },
        expertFeedback: { totalScore: 100, createdAt: staleDate, neverStale: true },
      },
    ]));

    mockChatFindOne.mockReturnValue({ populate: () => ({ lean: async () => null }) });

    const result = await QuestionAnswerService.getSimilarQuestionsContext('benefits', {
      k: 3,
      recencyDays: 365,
      includeQuestionFlow: false,
    });

    expect(result).toContain('Q: Evergreen Q?');
  });

  it('disables the recency filter when recencyDays is 0', async () => {
    const staleDate = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000);

    mockMatchQuestions.mockResolvedValue([[
      { interactionId: 'stale', expertFeedbackId: 'ef-stale', similarity: 0.95 },
    ]]);

    mockInteractionFind.mockReturnValue(createChainableQuery([
      {
        _id: 'stale',
        question: { redactedQuestion: 'Stale Q?' },
        answer: { content: 'Stale A.' },
        expertFeedback: { totalScore: 80, createdAt: staleDate, neverStale: false },
      },
    ]));

    mockChatFindOne.mockReturnValue({ populate: () => ({ lean: async () => null }) });

    const result = await QuestionAnswerService.getSimilarQuestionsContext('benefits', {
      k: 3,
      recencyDays: 0,
      includeQuestionFlow: false,
    });

    expect(result).toContain('Q: Stale Q?');
  });
});
