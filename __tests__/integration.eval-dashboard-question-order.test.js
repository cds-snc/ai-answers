import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import handler from '../api/eval/eval-dashboard.js';

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

// Regression coverage for a multi-turn chat's questions rendering in the
// wrong order (3-2-1 instead of 1-2-3) once EvalDashboardPage.js started
// grouping a chat's rows together visually. __tests__/api.eval-dashboard.
// filters.test.js only asserts the shape of the $sort stage against a mocked
// Chat.aggregate - it can't catch a real MongoDB ordering bug (e.g. real
// documents' _id/createdAt behaving differently than a hand-written pipeline
// assertion would suggest). This seeds a real multi-question chat through a
// real aggregation and checks the actual returned row order.
describe('Integration: eval-dashboard question order within a chat', () => {
    let mongoServer;

    const makeInteraction = async (createdAt) => {
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

        // Three questions in one chat, asked minutes apart (realistic
        // multi-turn timing) - each interaction's own createdAt genuinely
        // differs, which is exactly the scenario the chatCreatedAt-based
        // primary sort key exists to protect against (see eval-dashboard.js's
        // sortStage comment): sorting by each interaction's own timestamp
        // would scatter these three rows instead of keeping them adjacent
        // and in order.
        const base = new Date('2026-01-01T12:00:00Z');
        const q1 = await makeInteraction(new Date(base.getTime()));
        const q2 = await makeInteraction(new Date(base.getTime() + 5 * 60 * 1000));
        const q3 = await makeInteraction(new Date(base.getTime() + 10 * 60 * 1000));

        await Chat.create({
            chatId: 'chat-multi-question',
            user: user._id,
            interactions: [q1._id, q2._id, q3._id],
            createdAt: base,
            pageLanguage: 'en',
        });
    });

    const callHandler = async (query) => {
        const req = {
            method: 'GET',
            query: {
                startDate: '2020-01-01',
                endDate: '2030-01-01',
                start: '0',
                length: '10',
                ...query,
            },
        };
        let jsonBody;
        const res = {
            status: vi.fn().mockReturnThis(),
            json: vi.fn((body) => { jsonBody = body; return res; }),
        };
        await handler(req, res);
        return jsonBody;
    };

    it('returns the default (Date) sort with question 1 before 2 before 3, not reversed', async () => {
        const body = await callHandler({});
        const rows = body.data.filter((r) => r.chatId === 'chat-multi-question');
        expect(rows.map((r) => r.questionNumber)).toEqual([1, 2, 3]);
    });

    it('keeps question order intact under an explicit column sort too (e.g. department)', async () => {
        const body = await callHandler({ orderBy: 'department', orderDir: 'asc' });
        const rows = body.data.filter((r) => r.chatId === 'chat-multi-question');
        expect(rows.map((r) => r.questionNumber)).toEqual([1, 2, 3]);
    });
});
