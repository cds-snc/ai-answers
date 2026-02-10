import { describe, it, expect, vi, beforeEach } from 'vitest';
import botFingerprintPresence from '../bot-fingerprint-presence.js';
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
    let req, res, next;

    beforeEach(() => {
        vi.clearAllMocks();
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
            setHeader: vi.fn(),
            end: vi.fn(),
            status: vi.fn().mockReturnThis(),
            json: vi.fn().mockReturnThis(),
        };
        next = vi.fn();
        process.env.FP_PEPPER = 'test-pepper';
    });

    describe('botFingerprintPresence', () => {
        it('blocks anonymous request with no fingerprint', () => {
            botFingerprintPresence(req, res, next);
            expect(res.statusCode).toBe(403);
            expect(next).not.toHaveBeenCalled();
        });

        it('lazy initializes visitorId from body', () => {
            req.body.visitorId = 'browser123';
            botFingerprintPresence(req, res, next);
            expect(req.session.visitorId).toBeDefined();
            expect(next).toHaveBeenCalled();
        });
    });

    describe('chat-session', () => {
        it('generates chatId if missing', async () => {
            req.session.visitorId = 'some-hash';
            const mw = sessionMiddleware();
            await mw(req, res, next);
            expect(req.chatId).toBeDefined();
            expect(req.session.chatIds).toContain(req.chatId);
            expect(next).toHaveBeenCalled();
        });

        it('accepts provided chatId only if it belongs to the session', async () => {
            req.session.visitorId = 'some-hash';
            req.session.chatIds = ['my-custom-id'];
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
