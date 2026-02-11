import { describe, it, expect, vi, beforeEach } from 'vitest';
import { withBotProtection } from '../bot-protection.js';
import sessionMiddleware from '../chat-session.js';
import crypto from 'crypto';

vi.mock('../../services/ChatSessionService.js', () => ({
    default: {
        isManagementEnabled: vi.fn(() => true),
        sessionsAvailable: vi.fn(() => true),
        validateChatId: vi.fn(() => true),
    }
}));

vi.mock('../../services/ChatSessionMetricsService.js', () => ({
    default: {
        recordRateLimiterSnapshot: vi.fn(),
        registerChat: vi.fn(),
    }
}));

describe('Middleware Session Logic', () => {
    let req, res, next, handlerCalled;

    beforeEach(() => {
        vi.clearAllMocks();
        handlerCalled = false;
        req = {
            url: '/api/chat/chat-graph-run',
            originalUrl: '/api/chat/chat-graph-run',
            body: {},
            session: {
                save: vi.fn((cb) => cb && cb()),
            },
            headers: {},
        };
        res = {
            statusCode: 200,
            headersSent: false,
            setHeader: vi.fn(),
            end: vi.fn(),
            status: vi.fn().mockReturnThis(),
            json: vi.fn().mockReturnThis(),
        };
        next = vi.fn();
        process.env.FP_PEPPER = 'test-pepper';
    });

    describe('withBotProtection', () => {
        const mockHandler = async (req, res) => { handlerCalled = true; };

        it('blocks anonymous request with no fingerprint', async () => {
            const protected_ = withBotProtection(mockHandler);
            await protected_(req, res);
            expect(res.statusCode).toBe(403);
            expect(handlerCalled).toBe(false);
        });

        it('lazy initializes visitorId from body and calls handler', async () => {
            req.body.visitorId = 'browser123';
            const protected_ = withBotProtection(mockHandler);
            await protected_(req, res);
            expect(req.session.visitorId).toBeDefined();
            expect(handlerCalled).toBe(true);
        });
    });

    describe('chat-session', () => {
        it('generates chatId if missing', async () => {
            req.session.visitorId = 'some-hash';
            const mw = sessionMiddleware();
            await mw(req, res, next);
            expect(req.chatId).toBeDefined();
            expect(req.session.chatIds).toBeDefined();
            expect(Object.prototype.hasOwnProperty.call(req.session.chatIds, req.chatId)).toBe(true);
            expect(next).toHaveBeenCalled();
        });

        it('accepts provided chatId only if it belongs to the session', async () => {
            req.session.visitorId = 'some-hash';
            req.session.chatIds = { 'my-custom-id': true };
            req.body.chatId = 'my-custom-id';
            const mw = sessionMiddleware();
            await mw(req, res, next);
            expect(req.chatId).toBe('my-custom-id');
            expect(next).toHaveBeenCalled();
        });

        it('rejects provided chatId that is not in the session', async () => {
            req.session.visitorId = 'some-hash';
            req.body.chatId = 'not-owned-id';
            const mw = sessionMiddleware();
            await mw(req, res, next);
            expect(res.statusCode).toBe(403);
            expect(res.end).toHaveBeenCalled();
            expect(next).not.toHaveBeenCalled();
        });
    });
});
