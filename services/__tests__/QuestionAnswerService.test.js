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
const { mockMatchQuestions, mockInteractionFind, mockChatFindOne, mockInitVectorService } = vi.hoisted(() => ({
    mockMatchQuestions: vi.fn(),
    mockInteractionFind: vi.fn(),
    mockChatFindOne: vi.fn(),
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
  Chat: { findOne: mockChatFindOne },
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
    expect(result).toContain('Citation: https://example.gc.ca');
  });

  it('returns empty string when no matches are found', async () => {
    mockMatchQuestions.mockResolvedValue([[]]);
    mockInteractionFind.mockReturnValue(createChainableQuery([]));
    mockChatFindOne.mockReturnValue({ populate: () => ({ lean: async () => null }) });

    const result = await QuestionAnswerService.getSimilarQuestionsContext('benefits');
    expect(result).toBe('');
  });
});
