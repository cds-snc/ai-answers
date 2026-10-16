import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import getContentIssueChatsMetrics from '../api/metrics/metrics-content-issue-chats.js';
import getHarmfulChatsMetrics from '../api/metrics/metrics-harmful-chats.js';

import { Chat } from '../models/chat.js';
import { Interaction } from '../models/interaction.js';
import { ExpertFeedback } from '../models/expertFeedback.js';

vi.mock('../middleware/auth.js', async () => ({
    withProtection: (fn) => fn,
    authMiddleware: (req, res, next) => next(),
    adminMiddleware: (req, res, next) => next(),
    partnerOrAdminMiddleware: (req, res, next) => next()
}));

vi.mock('../api/db/db-connect.js', () => ({
    default: async () => { }
}));

const call = (handler, query) => new Promise((resolve) => {
    const res = { status: (code) => ({ json: (data) => resolve({ code, data }) }) };
    handler({ method: 'GET', query: { startDate: '2020-01-01', endDate: '2030-01-01', ...query } }, res);
});

// The lists show questionNumber so links that share a chat ID can be told
// apart (WCAG 2.4.4). Each endpoint rebuilds its rows in a $project and a
// .map(), so check the field survives both.
describe('Integration: flagged chat lists carry questionNumber', () => {
    let mongoServer;
    let flagged;

    beforeAll(async () => {
        mongoServer = await MongoMemoryServer.create();
        await mongoose.connect(mongoServer.getUri());
    }, 60000);

    // test/vitest-hooks.js resets the database before every test.
    beforeEach(async () => {
        // Question 1 unflagged, question 2 flagged as both content issue and harmful.
        const plain = await Interaction.create({ question: new mongoose.Types.ObjectId() });
        const feedback = await ExpertFeedback.create({ totalScore: 0, sentence1Score: 0, sentence1ContentIssue: true, sentence1Harmful: true });
        flagged = await Interaction.create({ question: new mongoose.Types.ObjectId(), expertFeedback: feedback._id });
        await Chat.create({ chatId: 'two-questions', interactions: [plain._id, flagged._id], pageLanguage: 'en', createdAt: new Date('2026-08-10') });
    });

    afterAll(async () => {
        await mongoose.disconnect();
        await mongoServer.stop();
    });

    it('content issue chats', async () => {
        const { code, data } = await call(getContentIssueChatsMetrics, {});
        expect(code).toBe(200);
        expect(data.metrics.contentIssueChats).toEqual([
            expect.objectContaining({ chatId: 'two-questions', interactionId: String(flagged._id), questionNumber: 2 }),
        ]);
    });

    it('harmful chats', async () => {
        const { code, data } = await call(getHarmfulChatsMetrics, {});
        expect(code).toBe(200);
        expect(data.metrics.harmfulChats).toEqual([
            expect.objectContaining({ chatId: 'two-questions', interactionId: String(flagged._id), questionNumber: 2 }),
        ]);
    });
});
