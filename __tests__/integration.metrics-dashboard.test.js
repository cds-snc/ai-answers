
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import getUsageMetrics from '../api/metrics/metrics-usage.js';
import getSessionMetrics from '../api/metrics/metrics-sessions.js';
import getExpertMetrics from '../api/metrics/metrics-expert-feedback.js';
import getAiEvalMetrics from '../api/metrics/metrics-ai-eval.js';
import getPublicFeedbackMetrics from '../api/metrics/metrics-public-feedback.js';
import getDepartmentMetrics from '../api/metrics/metrics-departments.js';

import { Chat } from '../models/chat.js';
import { Interaction } from '../models/interaction.js';
import { Context } from '../models/context.js';
import { Answer } from '../models/answer.js';
import { User } from '../models/user.js';
import { ExpertFeedback } from '../models/expertFeedback.js';

// Mock auth middleware using vi.mock BEFORE imports (hoisted automatically by vitest)
vi.mock('../middleware/auth.js', async () => {
    return {
        withProtection: (fn) => fn,
        authMiddleware: (req, res, next) => next(),
        adminMiddleware: (req, res, next) => next(),
        partnerOrAdminMiddleware: (req, res, next) => next()
    };
});

// Mock dbConnect to do nothing (since we connect manually in beforeAll)
vi.mock('../api/db/db-connect.js', () => ({
    default: async () => { }
}));


describe('Integration: Metrics Dashboard Aggregation', () => {
    let mongoServer;

    beforeAll(async () => {
        // Spin up an actual in-memory MongoDB instance
        mongoServer = await MongoMemoryServer.create();
        const uri = mongoServer.getUri();
        await mongoose.connect(uri);

        // --- SEED DATA ---
        const user = await User.create({ email: 'test@example.com', password: 'password123' });

        // Context with string tokens (simulating the bug source)
        const context = await Context.create({
            inputTokens: "50", // <--- String! This would crash $add
            outputTokens: 100, // Number
            pageLanguage: 'en',
            department: 'Test Dept'
        });

        // Answer with string tokens
        const answer = await Answer.create({
            content: 'Test answer',
            inputTokens: 25,
            outputTokens: "75", // <--- String! This would crash $add
            answerType: 'normal'
        });

        // Expert Feedback (Correct)
        const expertFeedback = await ExpertFeedback.create({
            feedback: 'correct',
            totalScore: 100,
            createdAt: new Date()
        });

        const interaction = await Interaction.create({
            context: context._id,
            answer: answer._id,
            expertFeedback: expertFeedback._id,
            question: new mongoose.Types.ObjectId(), // Dummy ID
            createdAt: new Date()
        });

        await Chat.create({
            chatId: 'chat-123',
            user: user._id,
            interactions: [interaction._id],
            createdAt: new Date(),
            pageLanguage: 'en'
        });
    }, 60000);

    afterAll(async () => {
        await mongoose.disconnect();
        await mongoServer.stop();
    });

    // Mock Response Helper
    const createMockRes = (cb) => {
        return {
            status: (code) => {
                return {
                    json: (data) => {
                        cb(code, data);
                    }
                };
            }
        };
    };

    const commonReq = {
        method: 'GET',
        query: {
            startDate: '2020-01-01',
            endDate: '2030-01-01'
        }
    };

    it('getUsageMetrics: should aggregate numbers including string tokens', async () => new Promise(done => {
        const res = createMockRes((code, data) => {
            expect(code).toBe(200);
            expect(data.success).toBe(true);
            // 50 + 25 = 75
            expect(data.metrics.totalInputTokens).toBe(75);
            // 100 + 75 = 175
            expect(data.metrics.totalOutputTokens).toBe(175);
            expect(data.metrics.totalQuestions).toBe(1);
            expect(data.metrics.answerTypes.normal.total).toBe(1);
            done();
        });
        getUsageMetrics(commonReq, res);
    }));

    it('getSessionMetrics: should count sessions and question depths', async () => new Promise(done => {
        const res = createMockRes((code, data) => {
            expect(code).toBe(200);
            expect(data.success).toBe(true);
            expect(data.metrics.totalConversations).toBe(1);
            expect(data.metrics.sessionsByQuestionCount.singleQuestion.total).toBe(1);
            done();
        });
        getSessionMetrics(commonReq, res);
    }));

    it('getExpertMetrics: should aggregate expert feedback', async () => new Promise(done => {
        const res = createMockRes((code, data) => {
            expect(code).toBe(200);
            expect(data.success).toBe(true);
            expect(data.metrics.expertScored.total.total).toBe(1);
            expect(data.metrics.expertScored.correct.total).toBe(1);
            done();
        });
        getExpertMetrics(commonReq, res);
    }));

    it('getDepartmentMetrics: should aggregate stats by department', async () => new Promise(done => {
        const res = createMockRes((code, data) => {
            expect(code).toBe(200);
            expect(data.success).toBe(true);
            const deptStats = data.metrics.byDepartment['Test Dept'];
            expect(deptStats).toBeDefined();
            expect(deptStats.total).toBe(1);
            expect(deptStats.expertScored.correct).toBe(1);
            done();
        });
        getDepartmentMetrics(commonReq, res);
    }));

    // AI Eval and Public Feedback would need more data setup, assuming they return 0/empty for now
    it('getAiEvalMetrics: should return zero/empty states for no data', async () => new Promise(done => {
        const res = createMockRes((code, data) => {
            expect(code).toBe(200);
            expect(data.success).toBe(true);
            expect(data.metrics.aiScored.total.total).toBe(0);
            done();
        });
        getAiEvalMetrics(commonReq, res);
    }));

    it('getPublicFeedbackMetrics: should return zero/empty states for no data', async () => new Promise(done => {
        const res = createMockRes((code, data) => {
            expect(code).toBe(200);
            expect(data.success).toBe(true);
            expect(data.metrics.publicFeedbackTotals.totalQuestionsWithFeedback).toBe(0);
            done();
        });
        getPublicFeedbackMetrics(commonReq, res);
    }));

});
