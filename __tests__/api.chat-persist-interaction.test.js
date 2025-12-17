import { describe, it, expect, vi, beforeEach } from 'vitest';
import handler from '../api/chat/chat-persist-interaction.js';
import { InteractionPersistenceService } from '../services/InteractionPersistenceService.js';

vi.mock('../services/InteractionPersistenceService.js', () => ({
    InteractionPersistenceService: {
        persistInteraction: vi.fn(),
    },
}));

vi.mock('../services/ServerLoggingService.js', () => ({
    default: {
        info: vi.fn(),
        error: vi.fn(),
    },
}));

// Mock middleware
vi.mock('../middleware/chat-session.js', () => ({
    withSession: (fn) => (req, res) => {
        req.chatId = req.body?.chatId;
        return fn(req, res);
    }
}));
vi.mock('../middleware/auth.js', () => ({
    withOptionalUser: (fn) => (req, res) => fn(req, res)
}));

describe('api/chat/chat-persist-interaction handler', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('delegates to InteractionPersistenceService and returns success', async () => {
        InteractionPersistenceService.persistInteraction.mockResolvedValue();

        const req = {
            method: 'POST',
            body: {
                chatId: 'test-chat',
                userMessageId: 'msg-1',
                question: 'test'
            },
            user: { id: 'test-user' }
        };
        const res = {
            json: vi.fn(),
            setHeader: vi.fn(),
            status: vi.fn().mockReturnThis(),
            end: vi.fn(),
        };

        await handler(req, res);

        console.log('Calls:', InteractionPersistenceService.persistInteraction.mock.calls);

        expect(InteractionPersistenceService.persistInteraction).toHaveBeenCalled();
        expect(InteractionPersistenceService.persistInteraction.mock.calls[0][0]).toBe('test-chat');
        // Check 2nd arg (interaction/body)
        expect(InteractionPersistenceService.persistInteraction.mock.calls[0][1]).toEqual(expect.objectContaining({ chatId: 'test-chat' }));
        // Check 3rd arg (user)
        expect(InteractionPersistenceService.persistInteraction.mock.calls[0][2]).toEqual({ id: 'test-user' });
        // Check 4th arg (options)
        expect(InteractionPersistenceService.persistInteraction.mock.calls[0][3]).toEqual({ forceFallbackEval: false });

        expect(res.status).toHaveBeenCalledWith(200);
    });

    it('returns 500 when service fails', async () => {
        InteractionPersistenceService.persistInteraction.mockRejectedValue(new Error('DB Error'));

        const req = { method: 'POST', body: { chatId: 'c' } };
        const res = {
            json: vi.fn(),
            setHeader: vi.fn(),
            status: vi.fn().mockReturnThis(),
            end: vi.fn(),
        };

        await handler(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Failed to log interaction' }));
    });
});
