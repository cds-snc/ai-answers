// __tests__/api.chat-message.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import handler from '../api/chat/chat-message.js';
import { AnswerGenerationService } from '../services/AnswerGenerationService.js';

vi.mock('../services/AnswerGenerationService.js', () => ({
    AnswerGenerationService: {
        generateAnswer: vi.fn(),
    },
}));

vi.mock('../services/ServerLoggingService.js', () => ({
    default: {
        info: vi.fn(),
        error: vi.fn(),
    },
}));

// Mock middleware to isolate handler logic
vi.mock('../middleware/chat-session.js', () => ({
    withSession: (fn) => (req, res) => {
        req.chatId = req.body?.chatId;
        return fn(req, res);
    }
}));
vi.mock('../middleware/auth.js', () => ({
    withOptionalUser: (fn) => (req, res) => fn(req, res)
}));

describe('api/chat/chat-message handler', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('delegates to AnswerGenerationService and returns result', async () => {
        const mockResult = {
            content: 'Service Response',
            inputTokens: 10,
            outputTokens: 5,
            historySignature: 'abc123',
        };
        AnswerGenerationService.generateAnswer.mockResolvedValue(mockResult);

        const req = {
            method: 'POST',
            body: {
                message: 'Hi',
                chatId: 'test-chat-123',
                provider: 'openai'
            },
        };
        const res = {
            json: vi.fn(),
            setHeader: vi.fn(),
            status: vi.fn().mockReturnThis(),
            end: vi.fn(),
        };

        await handler(req, res);

        expect(AnswerGenerationService.generateAnswer).toHaveBeenCalledWith(req.body, 'test-chat-123');
        expect(res.json).toHaveBeenCalledWith(mockResult);
    });

    it('returns 500 when service fails', async () => {
        AnswerGenerationService.generateAnswer.mockRejectedValue(new Error('Service Failure'));

        const req = {
            method: 'POST',
            body: { chatId: 'test-error' },
        };
        const res = {
            json: vi.fn(),
            setHeader: vi.fn(),
            status: vi.fn().mockReturnThis(),
            end: vi.fn(),
        };

        await handler(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({
            error: 'Error processing your request',
            details: 'Service Failure'
        });
    });

    it('returns 405 for non-POST methods', async () => {
        const req = { method: 'GET' };
        const res = {
            setHeader: vi.fn(),
            status: vi.fn().mockReturnThis(),
            end: vi.fn(),
        };
        await handler(req, res);
        expect(res.status).toHaveBeenCalledWith(405);
    });
});
