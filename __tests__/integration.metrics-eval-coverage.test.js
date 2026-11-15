import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import getEvalCoverageMetrics from '../api/metrics/metrics-eval-coverage.js';

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
const QA_MATCH = { chatId: 'past-chat', interactionId: 'past-interaction', similarity: 0.9, totalScore: 100 };

// Inserted through the raw collection so createdAt is kept as given —
// Mongoose timestamps would overwrite it with "now".
async function seedFeedback({ createdAt, totalScore = 100, sentence1Score = 100, type = '', neverStale = false }) {
    const _id = new mongoose.Types.ObjectId();
    await ExpertFeedback.collection.insertOne({ _id, totalScore, sentence1Score, type, neverStale, createdAt, updatedAt: createdAt });
    return _id;
}

let seq = 0;
async function seedQuestion({ department = 'CRA', program = '', action = '', answerType = 'normal', feedback = null, informed = false, pageLanguage = 'en', askedDaysAgo = 5 }) {
    const context = await Context.create({ department, program, action, ...(informed ? { qaMatches: [QA_MATCH] } : {}) });
    const answer = await Answer.create({ content: 'answer', answerType });
    const interaction = await Interaction.create({
        context: context._id,
        answer: answer._id,
        workflow: 'GenericWithQAGraph',
        question: new mongoose.Types.ObjectId(),
        ...(feedback ? { expertFeedback: await seedFeedback(feedback) } : {})
    });
    seq += 1;
    await Chat.create({ chatId: `chat-${seq}`, interactions: [interaction._id], pageLanguage, createdAt: daysAgo(askedDaysAgo) });
}

const call = (query) => new Promise((resolve) => {
    const res = { status: (code) => ({ json: (data) => resolve({ code, data }) }) };
    getEvalCoverageMetrics({ method: 'GET', query: { startDate: daysAgo(30).toISOString(), endDate: new Date().toISOString(), ...query } }, res);
});

describe('Integration: evaluation coverage by program', () => {
    let mongoServer;

    beforeAll(async () => {
        mongoServer = await MongoMemoryServer.create();
        await mongoose.connect(mongoServer.getUri());
    }, 60000);

    // test/vitest-hooks.js resets the database before every test.
    beforeEach(async () => {
        const gst = { program: 'GST/HST' };
        // Perfect, recent human eval.
        await seedQuestion({ ...gst, action: 'Apply', feedback: { createdAt: daysAgo(10) } });
        // Non-perfect human eval inside the last 60 days before it stops being used.
        await seedQuestion({ ...gst, action: 'Apply', feedback: { createdAt: daysAgo(330), totalScore: 80, sentence1Score: 80 } });
        // No eval, but the answer used past evaluations.
        await seedQuestion({ ...gst, action: 'Apply', informed: true });
        // Old but flagged neverStale: still usable, never expiring.
        await seedQuestion({ ...gst, action: 'Sign in', feedback: { createdAt: daysAgo(400), neverStale: true } });
        // Old and not flagged: counted as an eval, but no longer usable.
        await seedQuestion({ ...gst, action: 'Apply', feedback: { createdAt: daysAgo(400) } });
        // Question asked outside the 30-day range, evaluated 100 days ago:
        // not a question or evaluation in range, but retrieval can still use it.
        await seedQuestion({ ...gst, action: 'Apply', askedDaysAgo: 200, feedback: { createdAt: daysAgo(100) } });
        // Evaluation saved without a total score (the form always sets one;
        // this is bad/legacy data): an evaluation, but retrieval can't use it.
        await seedQuestion({ ...gst, action: 'Apply', feedback: { createdAt: daysAgo(20), totalScore: null, sentence1Score: null } });
        // Legacy neverStale stored as a string — retrieval accepts it.
        await seedQuestion({ ...gst, action: 'Apply', feedback: { createdAt: daysAgo(400), neverStale: 'true' } });
        // An AI-typed feedback must never count as a human evaluation.
        await seedQuestion({ ...gst, action: 'Other', feedback: { createdAt: daysAgo(1), type: 'ai' } });
        // Unclassified normal question.
        await seedQuestion({ program: '' });
        // Non-normal answers carry no program and are out of scope.
        await seedQuestion({ program: '', answerType: 'not-gc', feedback: { createdAt: daysAgo(1) } });
        // Another department.
        await seedQuestion({ department: 'ESDC', program: 'Employment Insurance', action: 'Apply', feedback: { createdAt: daysAgo(1) } });
    });

    afterAll(async () => {
        await mongoose.disconnect();
        await mongoServer.stop();
    });

    it('counts questions and evaluations in the date range, and usable evaluations across all dates', async () => {
        const { code, data } = await call({ department: 'CRA' });
        expect(code).toBe(200);
        const { programs, recencyDays, expiringWindowDays } = data.metrics.evalCoverage;
        expect(recencyDays).toBe(365);
        expect(expiringWindowDays).toBe(60);

        expect(programs.map((p) => p.program)).toEqual(['GST/HST', 'unknown']);
        const gst = programs[0];
        expect(gst).toMatchObject({
            program: 'GST/HST',
            programFr: 'TPS/TVH',
            // In the date range only.
            questions: 8,
            humanEvals: 6,
            scoredEvals: 5,
            nonPerfectEvals: 1,
            informedAnswers: 1,
            // Whole corpus for the service, whatever the date range: fresh or
            // neverStale (boolean or string), scored, human.
            usableEvals: 5,
            expiringEvals: 1
        });
        // Most-used first; 'Other', 'unknown' and empty actions are left out.
        expect(gst.actions.map((a) => [a.action, a.count])).toEqual([['Apply', 6], ['Sign in', 1]]);
        expect(typeof gst.actions[0].actionFr).toBe('string');

        // Retrieval can't be traced to an unclassified service, so no in-use counts.
        expect(programs[1]).toMatchObject({ program: 'unknown', questions: 1, humanEvals: 0, usableEvals: null, expiringEvals: null, actions: [] });
    });

    it('sorts by question volume across departments when no department is selected', async () => {
        const { data } = await call({});
        const { programs } = data.metrics.evalCoverage;
        expect(programs.map((p) => p.program)).toEqual(['GST/HST', 'Employment Insurance', 'unknown']);
        expect(programs[1]).toMatchObject({ usableEvals: 1, expiringEvals: 0 });
    });
});
