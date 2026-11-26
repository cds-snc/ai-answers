import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import getMostUsedEvals from '../api/metrics/metrics-eval-reuse.js';

import { Chat } from '../models/chat.js';
import { Interaction } from '../models/interaction.js';
import { Context } from '../models/context.js';
import { Answer } from '../models/answer.js';
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

const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (n) => new Date(Date.now() - n * DAY);

// A past, evaluated question: the thing that gets reused. Its chat holds a
// first question so the evaluated one is question 2.
async function seedEvaluated({ chatId, department = 'CRA', program = 'GST/HST', totalScore = 100, pageLanguage = 'en', evaluatedDaysAgo = 50 }) {
    const efId = new mongoose.Types.ObjectId();
    await ExpertFeedback.collection.insertOne({ _id: efId, totalScore, createdAt: daysAgo(evaluatedDaysAgo) });
    const first = await Interaction.create({ question: new mongoose.Types.ObjectId() });
    const context = await Context.create({ department, program });
    const evaluated = await Interaction.create({ context: context._id, expertFeedback: efId, question: new mongoose.Types.ObjectId() });
    await Chat.create({ chatId, interactions: [first._id, evaluated._id], pageLanguage, createdAt: daysAgo(200) });
    return { chatId, interactionId: String(evaluated._id) };
}

let seq = 0;
// A new answer that was given past evaluations.
async function seedAnswer({ uses = [], department = 'CRA', workflow = 'GenericWithQAGraph', askedDaysAgo = 5, user = null }) {
    const qaMatches = uses.map((e) => ({ chatId: e.chatId, interactionId: e.interactionId, similarity: 0.9, totalScore: 100 }));
    const context = await Context.create({ department, ...(qaMatches.length ? { qaMatches } : {}) });
    const answer = await Answer.create({ content: 'answer', answerType: 'normal' });
    const interaction = await Interaction.create({ context: context._id, answer: answer._id, workflow, question: new mongoose.Types.ObjectId() });
    seq += 1;
    await Chat.create({ chatId: `answer-${seq}`, interactions: [interaction._id], pageLanguage: 'en', createdAt: daysAgo(askedDaysAgo), ...(user ? { user } : {}) });
}

const call = (query) => new Promise((resolve) => {
    const res = { status: (code) => ({ json: (data) => resolve({ code, data }) }) };
    getMostUsedEvals({ method: 'GET', query: { startDate: daysAgo(30).toISOString(), endDate: new Date().toISOString(), ...query } }, res);
});

describe('Integration: most-used evaluations', () => {
    let mongoServer;

    beforeAll(async () => {
        mongoServer = await MongoMemoryServer.create();
        await mongoose.connect(mongoServer.getUri());
    }, 60000);

    // test/vitest-hooks.js resets the database before every test.
    beforeEach(async () => {
        const popular = await seedEvaluated({ chatId: 'popular', totalScore: 80, pageLanguage: 'fr', evaluatedDaysAgo: 40 });
        const rare = await seedEvaluated({ chatId: 'rare' });
        const esdc = await seedEvaluated({ chatId: 'esdc', department: 'ESDC', program: 'Employment Insurance' });

        await seedAnswer({ uses: [popular, rare] });
        await seedAnswer({ uses: [popular] });
        await seedAnswer({ uses: [popular] });
        // Outside the date range: not counted.
        await seedAnswer({ uses: [rare], askedDaysAgo: 60 });
        await seedAnswer({ uses: [rare], askedDaysAgo: 90 });
        // Another workflow: not an eval-informed answer.
        await seedAnswer({ uses: [rare], workflow: 'InstantAndQAGraph' });
        await seedAnswer({ uses: [rare], workflow: 'InstantAndQAGraph' });
        // Another department.
        await seedAnswer({ uses: [esdc], department: 'ESDC' });
        // Asked by a signed-in admin (chat.user set): kept out by userType=public.
        await seedAnswer({ uses: [rare], user: new mongoose.Types.ObjectId() });
        await seedAnswer({ uses: [rare], user: new mongoose.Types.ObjectId() });
        await seedAnswer({ uses: [rare], user: new mongoose.Types.ObjectId() });
        // No evaluations used.
        await seedAnswer({});
    });

    afterAll(async () => {
        await mongoose.disconnect();
        await mongoServer.stop();
    });

    it('ranks the evaluations injected into answers in range, with what the list needs to link and describe them', async () => {
        const { code, data } = await call({ department: 'CRA' });
        expect(code).toBe(200);
        const { mostUsedEvals } = data.metrics;

        // rare: 1 public + 3 admin uses in range.
        expect(mostUsedEvals.map((e) => [e.chatId, e.uses])).toEqual([['rare', 4], ['popular', 3]]);
        const popular = mostUsedEvals.find((e) => e.chatId === 'popular');
        expect(popular).toMatchObject({
            chatId: 'popular',
            pageLanguage: 'fr',
            questionNumber: 2,
            program: 'GST/HST',
            programFr: 'TPS/TVH',
            totalScore: 80
        });
        expect(popular.interactionId).toMatch(/^[0-9a-f]{24}$/);
        expect(new Date(popular.evaluatedAt).getTime()).toBeCloseTo(daysAgo(40).getTime(), -5);
    });

    it('applies the user type filter, which reads the chat-level user field', async () => {
        const pub = await call({ department: 'CRA', userType: 'public' });
        expect(pub.data.metrics.mostUsedEvals.map((e) => [e.chatId, e.uses])).toEqual([['popular', 3], ['rare', 1]]);
        const admin = await call({ department: 'CRA', userType: 'admin' });
        expect(admin.data.metrics.mostUsedEvals.map((e) => [e.chatId, e.uses])).toEqual([['rare', 3]]);
    });

    it('covers every department when none is selected', async () => {
        const { data } = await call({});
        expect(data.metrics.mostUsedEvals.map((e) => e.chatId)).toEqual(['rare', 'popular', 'esdc']);
    });
});
