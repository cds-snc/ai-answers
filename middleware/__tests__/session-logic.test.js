import { describe, it, expect, vi, beforeEach } from 'vitest';
import botFingerprintPresence from '../bot-fingerprint-presence.js';
import sessionMiddleware, { validateConversationIntegrity } from '../chat-session.js';
import ConversationIntegrityService from '../../services/ConversationIntegrityService.js';
import ChatSessionMetricsService from '../../services/ChatSessionMetricsService.js';
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
        markSessionAuth: vi.fn(),
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

    describe('botFingerprintPresence', () => {
        it('blocks anonymous request with no fingerprint', async () => {
            handlerCalled = false;
            const nextFn = () => { handlerCalled = true; };
            await botFingerprintPresence(req, res, nextFn);
            expect(res.statusCode).toBe(403);
            expect(handlerCalled).toBe(false);
        });

        it('lazy initializes visitorId from body and calls handler', async () => {
            req.body.visitorId = 'browser123';
            handlerCalled = false;
            const nextFn = () => { handlerCalled = true; };
            await botFingerprintPresence(req, res, nextFn);
            expect(req.session.visitorId).toBeDefined();
            expect(req.session.save).toHaveBeenCalledTimes(1);
            expect(handlerCalled).toBe(true);
        });

        it('allows requests when the provided fingerprint does not match the session visitorId', async () => {
            req.session.visitorId = crypto.createHmac('sha256', 'dev-pepper')
                .update('browser123')
                .digest('hex');
            req.body.visitorId = 'different-browser';
            handlerCalled = false;
            const nextFn = () => { handlerCalled = true; };

            await botFingerprintPresence(req, res, nextFn);

            expect(res.statusCode).toBe(200);
            expect(res.end).not.toHaveBeenCalled();
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
            expect(req.session.save).toHaveBeenCalledTimes(1);
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

        it('marks authenticated sessions in the metrics buffer', async () => {
            req.sessionID = 'session-auth-123';
            req.session.passport = { user: 'user-123' };
            const mw = sessionMiddleware();

            await mw(req, res, next);

            expect(req.chatId).toBeDefined();
            expect(ChatSessionMetricsService.markSessionAuth).toHaveBeenCalledWith(req.sessionID, true);
            expect(next).toHaveBeenCalled();
        });
    });

    // The handler must only ever see history rebuilt from signed text.
    describe('validateConversationIntegrity', () => {
        const CHAT_ID = 'chat-1';
        const question = { sender: 'user', text: 'How do I renew a passport?' };
        const signedAnswer = (extra = {}) => ({
            sender: 'ai',
            interaction: {
                question: question.text,
                answer: { content: 'Use the form.', answerType: 'normal' },
                historySignature: ConversationIntegrityService.signTurns(CHAT_ID, [
                    { question: question.text, answer: 'Use the form.' },
                ]),
                ...extra,
            },
        });
        const post = (input) => ({ method: 'POST', chatId: CHAT_ID, body: { input } });
        const verifiedHistory = [
            { sender: 'user', text: question.text },
            { sender: 'ai', interaction: { question: question.text, answer: { content: 'Use the form.' } } },
        ];

        it('replaces the history with one rebuilt from the signed text', () => {
            const answer = signedAnswer({ context: { department: 'CRA-ARC', systemPrompt: 'client-held text' } });
            const request = post({
                conversationHistory: [question, answer, { sender: 'user', text: 'A question the pipeline failed on' }],
                historySignature: answer.interaction.historySignature,
            });

            expect(validateConversationIntegrity(request, res)).toBe(true);
            expect(request.body.input.conversationHistory).toEqual(verifiedHistory);
        });

        it('rejects a turn appended after the signed one', () => {
            const answer = signedAnswer();
            const request = post({
                conversationHistory: [question, answer, {
                    sender: 'ai',
                    interaction: { question: 'not asked', answer: { content: 'not answered' } },
                }],
                historySignature: answer.interaction.historySignature,
            });

            expect(validateConversationIntegrity(request, res)).toBe(false);
            expect(res.status).toHaveBeenCalledWith(403);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'invalid_signature' }));
        });

        it('rejects a changed signed turn', () => {
            const answer = signedAnswer();
            answer.interaction.answer.content = 'Use the form. And something else.';
            const request = post({
                conversationHistory: [question, answer],
                historySignature: answer.interaction.historySignature,
            });

            expect(validateConversationIntegrity(request, res)).toBe(false);
            expect(res.status).toHaveBeenCalledWith(403);
        });

        it('rejects a completed turn sent without a signature', () => {
            const request = post({ conversationHistory: [question, signedAnswer()] });

            expect(validateConversationIntegrity(request, res)).toBe(false);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'missing_signature' }));
        });

        it('rejects a signature issued for a different chat', () => {
            const answer = signedAnswer();
            const request = post({
                conversationHistory: [question, answer],
                historySignature: answer.interaction.historySignature,
            });
            request.chatId = 'another-chat';

            expect(validateConversationIntegrity(request, res)).toBe(false);
        });

        it('lets a new message through after a first-turn failure, with empty history', () => {
            const request = post({
                conversationHistory: [question, { sender: 'system', error: true, text: 'Something went wrong' }],
                historySignature: null,
            });

            expect(validateConversationIntegrity(request, res)).toBe(true);
            expect(request.body.input.conversationHistory).toEqual([]);
            expect(res.status).not.toHaveBeenCalled();
        });

        it('replaces a history holding only error messages with an empty one', () => {
            const request = post({
                conversationHistory: [{
                    sender: 'ai',
                    error: true,
                    interaction: { question: 'not asked', answer: { content: 'not answered' } },
                }],
            });

            expect(validateConversationIntegrity(request, res)).toBe(true);
            expect(request.body.input.conversationHistory).toEqual([]);
        });

        it('replaces a history that is not an array with an empty one', () => {
            const request = post({ conversationHistory: { length: 1, 0: 'not a real array' } });

            expect(validateConversationIntegrity(request, res)).toBe(true);
            expect(request.body.input.conversationHistory).toEqual([]);
        });
    });
});
