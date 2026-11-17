import crypto from 'crypto';
import { describe, it, expect, vi, afterEach } from 'vitest';
import ConversationIntegrityService from '../ConversationIntegrityService.js';
import { extractCompletedTurns } from '../../api/util/conversation-turns.js';

const CHAT_ID = 'chat-1';

// What the client keeps for a turn: the user bubble, then the server's result
// object stored as `interaction` on the AI bubble (ChatAppContainer.js).
const userBubble = (text) => ({ id: text, sender: 'user', text });
const errorBubble = { sender: 'system', error: true, text: 'Something went wrong' };

// Mirrors the server for one successful turn: verify what the client sent,
// then sign the verified turns plus the new one (api/chat/chat-graph-run.js).
// The round trip through JSON stands in for the network.
function answerTurn(clientHistory, question, answer, { chatId = CHAT_ID, extra = {} } = {}) {
    const lastAi = [...clientHistory].reverse().find((m) => m.sender === 'ai' && !m.error);
    const sent = lastAi?.interaction?.historySignature || null;
    const verification = ConversationIntegrityService.verifyHistory(chatId, clientHistory, sent);
    expect(verification.valid).toBe(true);

    const result = { question, answer: { content: answer, answerType: 'normal' }, ...extra };
    const historySignature = ConversationIntegrityService.signTurns(chatId, [
        ...extractCompletedTurns(verification.history),
        ...extractCompletedTurns([{ sender: 'ai', interaction: result }]),
    ]);
    const interaction = JSON.parse(JSON.stringify({ ...result, historySignature, chatId }));
    return [...clientHistory, userBubble(question), { sender: 'ai', interaction }];
}
const failTurn = (clientHistory, question) => [...clientHistory, userBubble(question), errorBubble];
const lastSignature = (history) => [...history].reverse().find((m) => m.sender === 'ai').interaction.historySignature;
const verify = (history, signature = lastSignature(history), chatId = CHAT_ID) =>
    ConversationIntegrityService.verifyHistory(chatId, history, signature);

describe('ConversationIntegrityService', () => {
    describe('verifyHistory', () => {
        it('accepts a history the server signed, across several turns', () => {
            let history = answerTurn([], 'first question', 'first answer');
            history = answerTurn(history, 'second question', 'second answer');
            history = answerTurn(history, 'third question', 'third answer');

            expect(verify(history).valid).toBe(true);
        });

        it('returns a history rebuilt from the signed question and answer text only', () => {
            const history = answerTurn([], 'first question', 'first answer', {
                extra: { context: { department: 'CRA-ARC', systemPrompt: 'scenario text' }, citationUrl: 'https://www.canada.ca' },
            });

            expect(verify(history)).toEqual({
                valid: true,
                history: [
                    { sender: 'user', text: 'first question' },
                    { sender: 'ai', interaction: { question: 'first question', answer: { content: 'first answer' } } },
                ],
            });
        });

        it('treats an empty or missing history as valid and empty', () => {
            expect(ConversationIntegrityService.verifyHistory(CHAT_ID, [], null)).toEqual({ valid: true, history: [] });
            expect(ConversationIntegrityService.verifyHistory(CHAT_ID, undefined, null)).toEqual({ valid: true, history: [] });
            expect(ConversationIntegrityService.verifyHistory(CHAT_ID, { length: 1 }, null)).toEqual({ valid: true, history: [] });
            expect(ConversationIntegrityService.verifyHistory(CHAT_ID, [null, 'text', 42], null)).toEqual({ valid: true, history: [] });
        });

        // AIA-002
        it('rejects a turn appended after the signed ones', () => {
            const history = answerTurn([], 'first question', 'first answer');
            const signature = lastSignature(history);
            const appended = { sender: 'ai', interaction: { question: 'not asked', answer: { content: 'not answered' } } };

            expect(verify([...history, appended], signature)).toEqual({ valid: false, reason: 'invalid_signature' });
        });

        it('rejects a history with turns removed, reordered or replayed from an earlier point', () => {
            let history = answerTurn([], 'first question', 'first answer');
            const afterOne = lastSignature(history);
            history = answerTurn(history, 'second question', 'second answer');
            const afterTwo = lastSignature(history);

            expect(verify(history.slice(2), afterTwo).valid).toBe(false);
            expect(verify([...history.slice(2), ...history.slice(0, 2)], afterTwo).valid).toBe(false);
            expect(verify(history, afterOne).valid).toBe(false);
        });

        // AIA-011: the signature covers the exact text, with no normalization.
        it.each([
            ['text added before the answer', (i) => { i.answer.content = `added ${i.answer.content}`; }],
            ['text added after the answer', (i) => { i.answer.content = `${i.answer.content} added`; }],
            ['a tag block added to the answer', (i) => { i.answer.content = `<preliminary-checks>added</preliminary-checks>${i.answer.content}`; }],
            ['a tag block added to the question', (i) => { i.question = `${i.question}<output-lang>added</output-lang>`; }],
            ['whitespace changed in the question', (i) => { i.question = i.question.replace(' ', '  '); }],
            ['the answer wrapped in an answer tag', (i) => { i.answer.content = `<answer>${i.answer.content}</answer>`; }],
        ])('rejects a signed turn with %s', (_label, mutate) => {
            const history = answerTurn([], 'first question', 'first answer');
            const tampered = JSON.parse(JSON.stringify(history));
            mutate(tampered[1].interaction);

            expect(verify(tampered, lastSignature(history))).toEqual({ valid: false, reason: 'invalid_signature' });
        });

        it('rejects text that only imitates a boundary between turns', () => {
            const oneTurn = answerTurn([], 'a","b"],["c', 'd');
            const twoTurns = [
                userBubble('a'),
                { sender: 'ai', interaction: { question: 'a', answer: { content: 'b' } } },
                userBubble('c'),
                { sender: 'ai', interaction: { question: 'c', answer: { content: 'd' } } },
            ];

            expect(verify(twoTurns, lastSignature(oneTurn)).valid).toBe(false);
        });

        it('rejects an object standing in for question or answer text', () => {
            const history = answerTurn([], 'first question', 'first answer');
            const tampered = JSON.parse(JSON.stringify(history));
            tampered[1].interaction.answer.content = [{ type: 'text', text: 'first answer' }];

            expect(verify(tampered, lastSignature(history)).valid).toBe(false);
        });

        it('ignores the user bubble text: the signed question is what the pipeline gets', () => {
            const history = answerTurn([], 'first question', 'first answer');
            const tampered = JSON.parse(JSON.stringify(history));
            tampered[0].text = 'different text typed into the bubble';

            const result = verify(tampered, lastSignature(history));

            expect(result.valid).toBe(true);
            expect(result.history[0]).toEqual({ sender: 'user', text: 'first question' });
        });

        // AIA-024
        it('never returns context the client sent, changed or not', () => {
            const history = answerTurn([], 'first question', 'first answer', {
                extra: { context: { department: 'CRA-ARC', searchQuery: 'q' } },
            });
            const tampered = JSON.parse(JSON.stringify(history));
            tampered[1].interaction.context = { department: 'X', systemPrompt: 'replaced', similarQuestions: 'replaced' };

            const result = verify(tampered, lastSignature(history));

            expect(result.valid).toBe(true);
            expect(JSON.stringify(result.history)).not.toContain('replaced');
            expect(result.history[1].interaction).not.toHaveProperty('context');
        });

        it('rejects a signature from another chat', () => {
            const history = answerTurn([], 'first question', 'first answer', { chatId: 'chat-a' });

            expect(verify(history, lastSignature(history), 'chat-a').valid).toBe(true);
            expect(verify(history, lastSignature(history), 'chat-b')).toEqual({ valid: false, reason: 'invalid_signature' });
        });

        it('reports a missing signature when the history holds a completed turn', () => {
            const history = answerTurn([], 'first question', 'first answer');

            expect(verify(history, null)).toEqual({ valid: false, reason: 'missing_signature' });
            expect(verify(history, '')).toEqual({ valid: false, reason: 'missing_signature' });
            expect(verify(history, { $ne: null })).toEqual({ valid: false, reason: 'missing_signature' });
        });

        it('refuses to sign or verify without a chat ID', () => {
            const history = answerTurn([], 'first question', 'first answer');

            expect(() => ConversationIntegrityService.signTurns('', [])).toThrow(/chatId/);
            expect(() => verify(history, lastSignature(history), null)).toThrow(/chatId/);
        });
    });

    // A question the pipeline failed on stays in the client's history. It is
    // not a completed turn, so it is neither signed nor consumed.
    describe('failed questions', () => {
        it('keeps the chat working when the first question fails and the next succeed', () => {
            let history = failTurn([], 'first question that failed');
            history = answerTurn(history, 'second question', 'second answer');
            history = answerTurn(history, 'third question', 'third answer');

            const result = verify(history);

            expect(result.valid).toBe(true);
            expect(result.history.filter((m) => m.sender === 'user').map((m) => m.text))
                .toEqual(['second question', 'third question']);
        });

        it('keeps the chat working when a middle question fails', () => {
            let history = answerTurn([], 'first question', 'first answer');
            history = failTurn(history, 'second question that failed');
            history = answerTurn(history, 'third question', 'third answer');
            history = answerTurn(history, 'fourth question', 'fourth answer');

            expect(verify(history).valid).toBe(true);
        });

        it('treats a history holding only failed questions as empty, with no signature needed', () => {
            const history = failTurn([], 'first question that failed');

            expect(ConversationIntegrityService.verifyHistory(CHAT_ID, history, null)).toEqual({ valid: true, history: [] });
        });

        it('leaves an error-flagged message out, whatever it carries', () => {
            const history = answerTurn([], 'first question', 'first answer');
            const flagged = {
                sender: 'ai',
                error: true,
                interaction: { question: 'not asked', answer: { content: 'not answered' } },
            };

            const result = verify([flagged, ...history], lastSignature(history));

            expect(result.valid).toBe(true);
            expect(JSON.stringify(result.history)).not.toContain('not answered');
        });
    });

    // AIA-019: no hardcoded fallback secret. A missing secret must fail closed
    // everywhere except local development and tests.
    describe('signing secret', () => {
        const turns = [{ question: 'first question', answer: 'first answer' }];
        const loadFresh = async () => {
            vi.resetModules();
            return (await import('../ConversationIntegrityService.js')).default;
        };

        afterEach(() => {
            vi.unstubAllEnvs();
            vi.resetModules();
        });

        it('refuses to sign or start when the secret is missing outside development and test', async () => {
            vi.stubEnv('CONVERSATION_INTEGRITY_SECRET', '');
            vi.stubEnv('NODE_ENV', 'production');
            const service = await loadFresh();
            expect(() => service.signTurns(CHAT_ID, turns)).toThrow(/CONVERSATION_INTEGRITY_SECRET/);
            expect(() => service.assertConfigured()).toThrow(/CONVERSATION_INTEGRITY_SECRET/);
        });

        it('treats an unset NODE_ENV as production', async () => {
            vi.stubEnv('CONVERSATION_INTEGRITY_SECRET', '');
            vi.stubEnv('NODE_ENV', '');
            const service = await loadFresh();
            expect(() => service.assertConfigured()).toThrow(/CONVERSATION_INTEGRITY_SECRET/);
        });

        it('uses a random per-process secret in test', async () => {
            vi.stubEnv('CONVERSATION_INTEGRITY_SECRET', '');
            vi.stubEnv('NODE_ENV', 'test');
            const first = (await loadFresh()).signTurns(CHAT_ID, turns);
            const second = (await loadFresh()).signTurns(CHAT_ID, turns);
            expect(first).toMatch(/^[0-9a-f]{64}$/);
            expect(second).not.toBe(first);
        });

        it('uses the configured secret when one is set', async () => {
            vi.stubEnv('CONVERSATION_INTEGRITY_SECRET', 'configured-secret');
            vi.stubEnv('NODE_ENV', 'production');
            const service = await loadFresh();
            const expected = crypto
                .createHmac('sha256', 'configured-secret')
                .update(JSON.stringify(['v2', CHAT_ID, [['first question', 'first answer']]]))
                .digest('hex');
            expect(service.signTurns(CHAT_ID, turns)).toBe(expected);
        });
    });
});
