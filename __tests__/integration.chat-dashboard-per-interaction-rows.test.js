import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import handler from '../api/chat/chat-dashboard.js';

import { Chat } from '../models/chat.js';
import { Interaction } from '../models/interaction.js';
import { Context } from '../models/context.js';
import { Answer } from '../models/answer.js';
import { User } from '../models/user.js';

vi.mock('../middleware/auth.js', () => ({
    withProtection: (fn) => fn,
    authMiddleware: (req, res, next) => next(),
    adminMiddleware: (req, res, next) => next(),
    partnerOrAdminMiddleware: (req, res, next) => next()
}));

vi.mock('../api/db/db-connect.js', () => ({
    default: async () => { }
}));

// Chat Dashboard returns one row per interaction (question/answer pair)
// rather than one row per chat - a multi-turn chat produces multiple rows
// that share the same chatId. This used to be a regression test for a
// per-chat "filtered count vs true total" bug (interactionCount vs
// totalInteractionCount); that concept no longer exists now that each row
// is a single interaction, so this covers the replacement behaviour: a
// department filter narrows which interaction ROWS come back, and each
// row keeps its own department rather than the chat's interactions being
// summarized into one row.
describe('Integration: chat-dashboard per-interaction rows', () => {
    let mongoServer;
    const dateRange = {
        startDate: '2020-01-01',
        endDate: '2030-01-01',
    };

    const makeInteraction = async (department, createdAt = new Date()) => {
        const context = await Context.create({ pageLanguage: 'en', department });
        const answer = await Answer.create({ content: 'Test answer', answerType: 'normal' });
        return Interaction.create({
            context: context._id,
            answer: answer._id,
            question: new mongoose.Types.ObjectId(),
            createdAt,
        });
    };

    beforeAll(async () => {
        mongoServer = await MongoMemoryServer.create();
        await mongoose.connect(mongoServer.getUri());
    }, 60000);

    afterAll(async () => {
        await mongoose.disconnect();
        await mongoServer.stop();
    });

    // The project's global test setup (test/vitest-hooks.js) clears every
    // collection on the active mongoose connection before each test — so
    // seeding has to happen here, in a beforeEach that runs after that
    // global one, not once in beforeAll (which would get wiped before the
    // first test body ever runs).
    beforeEach(async () => {
        const user = await User.create({ email: 'reviewer@example.com', password: 'password123' });

        // One chat, 3 questions: 2 IRCC, 1 CRA-ARC.
        const interactions = await Promise.all([
            makeInteraction('IRCC'),
            makeInteraction('CRA-ARC'),
            makeInteraction('IRCC'),
        ]);

        await Chat.create({
            chatId: 'multi-dept-chat',
            user: user._id,
            interactions: interactions.map((i) => i._id),
            createdAt: new Date(),
            pageLanguage: 'en',
        });
    });

    const callHandler = async (query) => {
        const req = { method: 'GET', query: { ...dateRange, length: 50, start: 0, ...query } };
        let jsonBody;
        const res = {
            status: vi.fn().mockReturnThis(),
            json: vi.fn((body) => { jsonBody = body; return res; }),
        };
        await handler(req, res);
        return jsonBody;
    };

    it('returns only the matching interaction rows when department-filtered, each keeping its own department', async () => {
        const body = await callHandler({ department: 'IRCC' });
        const rows = body.data.filter((r) => r.chatId === 'multi-dept-chat');

        expect(rows).toHaveLength(2);
        expect(rows.every((r) => r.department === 'IRCC')).toBe(true);
    });

    it('returns one row per interaction, all sharing the chat\'s chatId, when unfiltered', async () => {
        const body = await callHandler({});
        const rows = body.data.filter((r) => r.chatId === 'multi-dept-chat');

        expect(rows).toHaveLength(3);
        expect(rows.map((r) => r.department).sort()).toEqual(['CRA-ARC', 'IRCC', 'IRCC']);
    });
});

// Two different users' chats can have their turns interleaved in real
// wall-clock time (chat B's first question can land between chat A's second
// and third). The default sort has to cluster each chat's rows together and
// in question order regardless - sorting by each row's own interaction
// timestamp would scatter a multi-turn chat's rows across whatever other
// chats happened to be active in between.
describe('Integration: chat-dashboard default sort keeps a chat\'s rows together and in sequence', () => {
    let mongoServer;
    const dateRange = { startDate: '2020-01-01', endDate: '2030-01-01' };

    const makeInteractionAt = async (createdAt) => {
        const context = await Context.create({ pageLanguage: 'en', department: 'IRCC' });
        const answer = await Answer.create({ content: 'Test answer', answerType: 'normal' });
        return Interaction.create({
            context: context._id,
            answer: answer._id,
            question: new mongoose.Types.ObjectId(),
            createdAt,
        });
    };

    beforeAll(async () => {
        mongoServer = await MongoMemoryServer.create();
        await mongoose.connect(mongoServer.getUri());
    }, 60000);

    afterAll(async () => {
        await mongoose.disconnect();
        await mongoServer.stop();
    });

    beforeEach(async () => {
        const user = await User.create({ email: 'reviewer2@example.com', password: 'password123' });

        // Chat A created first (09:00), chat B created second (09:02) - so
        // under the default desc sort, B's rows should come first. Their
        // interactions interleave in time: A1(09:01) < B1(09:03) <
        // A2(09:05) < B2(09:07) < A3(09:10).
        const [a1, a2, a3] = await Promise.all([
            makeInteractionAt(new Date('2021-01-01T09:01:00Z')),
            makeInteractionAt(new Date('2021-01-01T09:05:00Z')),
            makeInteractionAt(new Date('2021-01-01T09:10:00Z')),
        ]);
        const [b1, b2] = await Promise.all([
            makeInteractionAt(new Date('2021-01-01T09:03:00Z')),
            makeInteractionAt(new Date('2021-01-01T09:07:00Z')),
        ]);

        await Chat.create({
            chatId: 'sequence-chat-a',
            user: user._id,
            interactions: [a1._id, a2._id, a3._id],
            createdAt: new Date('2021-01-01T09:00:00Z'),
            pageLanguage: 'en',
        });
        await Chat.create({
            chatId: 'sequence-chat-b',
            user: user._id,
            interactions: [b1._id, b2._id],
            createdAt: new Date('2021-01-01T09:02:00Z'),
            pageLanguage: 'en',
        });
    });

    const callHandler = async (query) => {
        const req = { method: 'GET', query: { ...dateRange, length: 50, start: 0, ...query } };
        let jsonBody;
        const res = {
            status: vi.fn().mockReturnThis(),
            json: vi.fn((body) => { jsonBody = body; return res; }),
        };
        await handler(req, res);
        return jsonBody;
    };

    it('groups each chat\'s rows contiguously, in questionNumber order, ordered by chat recency', async () => {
        const body = await callHandler({});
        const rows = body.data.filter((r) => r.chatId === 'sequence-chat-a' || r.chatId === 'sequence-chat-b');

        expect(rows.map((r) => `${r.chatId}#${r.questionNumber}`)).toEqual([
            'sequence-chat-b#1',
            'sequence-chat-b#2',
            'sequence-chat-a#1',
            'sequence-chat-a#2',
            'sequence-chat-a#3',
        ]);
    });
});

// Regression test for a real tie: two different chats created at the exact
// same millisecond (plausible under any concurrent traffic - this needs no
// unusual timing, just two sessions starting around the same moment). A
// $sort's tiebreak keys are lexicographic - questionNumber ranking ahead of
// chatId would group every tied chat's Q1 together, then every Q2, etc.,
// still interleaving the two chats even with chatId present as a later key.
// chatId has to be the tiebreak that comes right after chatCreatedAt, before
// questionNumber, for a tie to still resolve into two contiguous blocks.
describe('Integration: chat-dashboard groups chats that tie on the exact same createdAt', () => {
    let mongoServer;
    const dateRange = { startDate: '2020-01-01', endDate: '2030-01-01' };
    const TIE_TIMESTAMP = new Date('2021-06-01T12:00:00.000Z');

    const makeInteractionAt = async (createdAt) => {
        const context = await Context.create({ pageLanguage: 'en', department: 'IRCC' });
        const answer = await Answer.create({ content: 'Test answer', answerType: 'normal' });
        return Interaction.create({
            context: context._id,
            answer: answer._id,
            question: new mongoose.Types.ObjectId(),
            createdAt,
        });
    };

    beforeAll(async () => {
        mongoServer = await MongoMemoryServer.create();
        await mongoose.connect(mongoServer.getUri());
    }, 60000);

    afterAll(async () => {
        await mongoose.disconnect();
        await mongoServer.stop();
    });

    beforeEach(async () => {
        const user = await User.create({ email: 'reviewer3@example.com', password: 'password123' });

        // Both chats share the identical millisecond createdAt - the tie
        // this test exists to cover. chatId 'tie-chat-a' sorts before
        // 'tie-chat-b' alphabetically/numerically either way.
        const [a1, a2] = await Promise.all([
            makeInteractionAt(TIE_TIMESTAMP),
            makeInteractionAt(TIE_TIMESTAMP),
        ]);
        const [b1, b2] = await Promise.all([
            makeInteractionAt(TIE_TIMESTAMP),
            makeInteractionAt(TIE_TIMESTAMP),
        ]);

        await Chat.create({
            chatId: 'tie-chat-a',
            user: user._id,
            interactions: [a1._id, a2._id],
            createdAt: TIE_TIMESTAMP,
            pageLanguage: 'en',
        });
        await Chat.create({
            chatId: 'tie-chat-b',
            user: user._id,
            interactions: [b1._id, b2._id],
            createdAt: TIE_TIMESTAMP,
            pageLanguage: 'en',
        });
    });

    const callHandler = async (query) => {
        const req = { method: 'GET', query: { ...dateRange, length: 50, start: 0, ...query } };
        let jsonBody;
        const res = {
            status: vi.fn().mockReturnThis(),
            json: vi.fn((body) => { jsonBody = body; return res; }),
        };
        await handler(req, res);
        return jsonBody;
    };

    it('keeps each tied chat\'s rows as one contiguous block instead of interleaving by questionNumber', async () => {
        const body = await callHandler({});
        const rows = body.data.filter((r) => r.chatId === 'tie-chat-a' || r.chatId === 'tie-chat-b');

        expect(rows).toHaveLength(4);
        // Whichever chat sorts first, both its rows must be adjacent (block
        // of 2, then the other chat's block of 2) - not interleaved like
        // [a#1, b#1, a#2, b#2], which is what grouping-by-questionNumber
        // first would produce.
        const chatIdSequence = rows.map((r) => r.chatId);
        expect(chatIdSequence).toEqual([chatIdSequence[0], chatIdSequence[0], chatIdSequence[3], chatIdSequence[3]]);
        expect(rows.map((r) => r.questionNumber)).toEqual([1, 2, 1, 2]);
    });
});
