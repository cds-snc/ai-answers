import { describe, it, expect, vi, beforeEach } from 'vitest';
import handler from '../chat-similar-answer.js';
import { SimilarAnswerService } from '../../../services/SimilarAnswerService.js';

vi.mock('../../../services/SimilarAnswerService.js', () => ({
  SimilarAnswerService: {
    findSimilarAnswer: vi.fn(),
  },
}));

vi.mock('../../../services/ServerLoggingService.js', () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../../../middleware/chat-session.js', () => ({
  withSession: (fn) => (req, res) => {
    req.chatId = req.body?.chatId;
    return fn(req, res);
  }
}));
vi.mock('../../../middleware/auth.js', () => ({
  withOptionalUser: (fn) => (req, res) => fn(req, res)
}));

describe('chat-similar-answer handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('delegates to SimilarAnswerService and returns JSON', async () => {
    const mockResult = { answer: 'Similar Answer', interactionId: '123' };
    SimilarAnswerService.findSimilarAnswer.mockResolvedValue(mockResult);

    const req = {
      method: 'POST',
      body: {
        questions: ['Q'],
        selectedAI: 'openai',
        language: 'en',
        searchProvider: 'google',
        recencyDays: 365,
        expertFeedbackRating: 5
      },
      chatId: 'test-chat'
    };
    req.body.chatId = 'test-chat';

    const res = {
      json: vi.fn(),
      setHeader: vi.fn(),
      status: vi.fn().mockReturnThis(),
      end: vi.fn()
    };

    await handler(req, res);

    expect(SimilarAnswerService.findSimilarAnswer).toHaveBeenCalledWith(expect.objectContaining({
      questions: ['Q'],
      selectedAI: 'openai',
      pageLanguage: 'en',
      chatId: 'test-chat',
      recencyDays: 365,
      requestedRating: 5
    }));
    expect(res.json).toHaveBeenCalledWith(mockResult);
  });

  it('returns 500 if service fails', async () => {
    SimilarAnswerService.findSimilarAnswer.mockRejectedValue(new Error('Service error'));

    const req = { method: 'POST', body: { questions: ['Q'], pageLanguage: 'en' } };
    const res = {
      json: vi.fn(),
      setHeader: vi.fn(),
      status: vi.fn().mockReturnThis(),
      end: vi.fn()
    };

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'internal error' }));
  });

  it('returns 405 for non-POST', async () => {
    const req = { method: 'GET' };
    const res = { setHeader: vi.fn(), status: vi.fn().mockReturnThis(), end: vi.fn() };
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(405);
  });
});
