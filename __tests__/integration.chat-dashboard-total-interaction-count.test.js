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

// Regression test for the department-filter scoping bug: filtering a chat's
// dashboard row to one department used to make interactionCount (and the
// department list) reflect only the matching interactions, silently hiding
// that the chat had more questions in other departments. totalInteractionCount
// is computed once, before any filter narrows the interactions, specifically
// so the UI can tell the reviewer "this chat has more than what's shown".
describe('Integration: chat-dashboard totalInteractionCount', () => {
    let mongoServer;
    const dateRange = {
        startDate: '2020-01-01',
        endDate: '2030-01-01',
    };

    const makeInteraction = async (department) => {
        const context = await Context.create({ pageLanguage: 'en', department });
        const answer = await Answer.create({ content: 'Test answer', answerType: 'normal' });
        return Interaction.create({
            context: context._id,
            answer: answer._id,
            question: new mongoose.Types.ObjectId(),
            createdAt: new Date(),
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
        const req = { method: 'GET', query: { ...dateRange, ...query } };
        let jsonBody;
        const res = {
            status: vi.fn().mockReturnThis(),
            json: vi.fn((body) => { jsonBody = body; return res; }),
        };
        await handler(req, res);
        return jsonBody;
    };

    it('reports the true total interaction count even when department-filtered down to fewer', async () => {
        const body = await callHandler({ department: 'IRCC' });
        const chat = body.logs.find((c) => c.chatId === 'multi-dept-chat');

        expect(chat).toBeTruthy();
        expect(chat.interactionCount).toBe(2); // only the 2 IRCC interactions matched
        expect(chat.totalInteractionCount).toBe(3); // but the chat has 3 total
    });

    it('matches interactionCount and totalInteractionCount when no department filter narrows anything', async () => {
        const body = await callHandler({});
        const chat = body.logs.find((c) => c.chatId === 'multi-dept-chat');

        expect(chat).toBeTruthy();
        expect(chat.interactionCount).toBe(3);
        expect(chat.totalInteractionCount).toBe(3);
    });
});
