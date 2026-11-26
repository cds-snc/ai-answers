import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import getUsageMetrics from '../api/metrics/metrics-usage.js';
import getEvalInformedChatsMetrics, { buildEvalInformedChatsPipeline } from '../api/metrics/metrics-eval-informed-chats.js';

import { Chat } from '../models/chat.js';
import { Interaction } from '../models/interaction.js';
import { Context } from '../models/context.js';
import { Answer } from '../models/answer.js';

vi.mock('../middleware/auth.js', async () => ({
    withProtection: (fn) => fn,
    authMiddleware: (req, res, next) => next(),
    adminMiddleware: (req, res, next) => next(),
    partnerOrAdminMiddleware: (req, res, next) => next()
}));

vi.mock('../api/db/db-connect.js', () => ({
    default: async () => { }
}));

const QA_MATCH = { chatId: 'past-chat', interactionId: 'past-interaction', similarity: 0.9, totalScore: 80 };

// One chat per question so pageLanguage can differ per question.
async function seedQuestion({ chatId, workflow, qaMatches, pageLanguage, department, createdAt }) {
    const context = await Context.create({ department, ...(qaMatches ? { qaMatches } : {}) });
    const answer = await Answer.create({ content: 'answer', answerType: 'normal' });
    const interaction = await Interaction.create({
        context: context._id,
        answer: answer._id,
        workflow,
        question: new mongoose.Types.ObjectId(),
    });
    await Chat.create({ chatId, interactions: [interaction._id], pageLanguage, createdAt });
    return interaction;
}

const call = (handler, query) => new Promise((resolve) => {
    const res = { status: (code) => ({ json: (data) => resolve({ code, data }) }) };
    handler({ method: 'GET', query: { startDate: '2020-01-01', endDate: '2030-01-01', ...query } }, res);
});

describe('Integration: eval-informed metrics', () => {
    let mongoServer;
    let informedEnOld;
    let informedEnNew;

    beforeAll(async () => {
        mongoServer = await MongoMemoryServer.create();
        await mongoose.connect(mongoServer.getUri());
    }, 60000);

    // test/vitest-hooks.js resets the database before every test.
    beforeEach(async () => {
        // Eligible + eval-informed (EN), two of them to check newest-first order.
        informedEnOld = await seedQuestion({ chatId: 'informed-en-old', workflow: 'GenericWithQAGraph', qaMatches: [QA_MATCH], pageLanguage: 'en', department: 'CRA', createdAt: new Date('2026-08-02') });
        informedEnNew = await seedQuestion({ chatId: 'informed-en-new', workflow: 'GenericWithQAGraph', qaMatches: [QA_MATCH], pageLanguage: 'en', department: 'CRA', createdAt: new Date('2026-08-05') });
        // Eligible, nothing qualified (empty array).
        await seedQuestion({ chatId: 'eligible-fr-empty', workflow: 'GenericWithQAGraph', qaMatches: [], pageLanguage: 'fr', department: 'CRA', createdAt: new Date('2026-08-03') });
        // Eligible, qaMatches never written (graph only persists it when non-empty).
        await seedQuestion({ chatId: 'eligible-en-missing', workflow: 'GenericWithQAGraph', pageLanguage: 'en', department: 'ESDC', createdAt: new Date('2026-08-04') });
        // Other workflow: not eligible, even with qaMatches.
        await seedQuestion({ chatId: 'other-workflow', workflow: 'InstantAndQAGraph', qaMatches: [QA_MATCH], pageLanguage: 'en', department: 'CRA', createdAt: new Date('2026-08-04') });
        // Pre-launch: no workflow saved.
        await seedQuestion({ chatId: 'no-workflow', workflow: '', pageLanguage: 'fr', department: 'CRA', createdAt: new Date('2026-07-01') });
    });

    afterAll(async () => {
        await mongoose.disconnect();
        await mongoServer.stop();
    });

    it('usage metrics count eval-informed answers out of eligible questions only', async () => {
        const { code, data } = await call(getUsageMetrics, {});
        expect(code).toBe(200);
        expect(data.metrics.totalQuestions).toBe(6);
        expect(data.metrics.evalInformed).toEqual({
            eligible: { total: 4, en: 3, fr: 1 },
            informed: { total: 2, en: 2, fr: 0 },
            // Earliest eligible question, not the pre-launch 2026-07-01 one.
            firstDate: new Date('2026-08-02'),
        });
    });

    it('usage metrics respect the department filter', async () => {
        const { data } = await call(getUsageMetrics, { department: 'ESDC' });
        expect(data.metrics.evalInformed).toEqual({
            eligible: { total: 1, en: 1, fr: 0 },
            informed: { total: 0, en: 0, fr: 0 },
            firstDate: new Date('2026-08-04'),
        });
    });

    it('lists eval-informed chats newest first, excluding other workflows', async () => {
        const { code, data } = await call(getEvalInformedChatsMetrics, {});
        expect(code).toBe(200);
        expect(data.metrics.evalInformedChats).toEqual([
            { chatId: 'informed-en-new', interactionId: String(informedEnNew._id), pageLanguage: 'en', createdAt: new Date('2026-08-05'), questionNumber: 1 },
            { chatId: 'informed-en-old', interactionId: String(informedEnOld._id), pageLanguage: 'en', createdAt: new Date('2026-08-02'), questionNumber: 1 },
        ]);
    });

    // Speed guard: sorting once, first, lets $limit stop the joins early. A
    // $sort after the lookups would push every chat in range through them.
    it('list pipeline sorts only once, before the joins', () => {
        const stages = buildEvalInformedChatsPipeline({ createdAt: {} });
        const sortIndexes = stages.flatMap((s, i) => ('$sort' in s ? [i] : []));
        const firstLookup = stages.findIndex((s) => '$lookup' in s);
        expect(sortIndexes).toEqual([1]);
        expect(sortIndexes[0]).toBeLessThan(firstLookup);
        expect(stages.at(-1)).toHaveProperty('$limit');
    });

    it('numbers each listed question by its position in the chat', async () => {
        const first = await seedQuestion({ chatId: 'tmp', workflow: 'GenericWithQAGraph', pageLanguage: 'en', department: 'CRA', createdAt: new Date('2026-08-10') });
        const second = await seedQuestion({ chatId: 'tmp2', workflow: 'GenericWithQAGraph', qaMatches: [QA_MATCH], pageLanguage: 'en', department: 'CRA', createdAt: new Date('2026-08-10') });
        await Chat.deleteMany({ chatId: { $in: ['tmp', 'tmp2'] } });
        await Chat.create({ chatId: 'two-questions', interactions: [first._id, second._id], pageLanguage: 'en', createdAt: new Date('2026-08-10') });

        const { data } = await call(getEvalInformedChatsMetrics, {});
        expect(data.metrics.evalInformedChats[0]).toMatchObject({ chatId: 'two-questions', interactionId: String(second._id), questionNumber: 2 });
    });

    it('list respects the department filter', async () => {
        const { data } = await call(getEvalInformedChatsMetrics, { department: 'ESDC' });
        expect(data.metrics.evalInformedChats).toEqual([]);
    });
});
