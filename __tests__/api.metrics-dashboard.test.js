
import { describe, it, expect, vi, beforeEach } from 'vitest';
import usageHandler from '../api/metrics/metrics-usage.js';
import expertHandler from '../api/metrics/metrics-expert-feedback.js';
import aiEvalHandler from '../api/metrics/metrics-ai-eval.js';
import publicFeedbackHandler from '../api/metrics/metrics-public-feedback.js';
import departmentsHandler from '../api/metrics/metrics-departments.js';
import * as ChatModel from '../models/chat.js';

// Mock DB connection
vi.mock('../api/db/db-connect.js', () => ({
    __esModule: true,
    default: async () => { }
}));

// Mock Auth
vi.mock('../middleware/auth.js', () => ({
    withProtection: (handler) => handler,
    authMiddleware: (handler) => handler,
    adminMiddleware: (handler) => handler,
    partnerOrAdminMiddleware: (handler) => handler
}));

// Helper to extract $project stages from pipeline
function extractProjectStages(pipeline) {
    return pipeline.filter(stage => stage.$project);
}

// Helper to get all fields from a $project stage
function getProjectFields(projectStage) {
    return Object.keys(projectStage.$project);
}

describe('Metrics Pipeline Projection Tests', () => {
    const baseReq = {
        method: 'GET',
        query: {
            startDate: '2026-01-07T00:00:00.000Z',
            endDate: '2026-01-14T00:00:00.000Z'
        }
    };

    const mockRes = () => ({
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
    });

    beforeEach(() => {
        ChatModel.Chat.aggregate = vi.fn().mockReturnValue({
            allowDiskUse: vi.fn().mockReturnValue(Promise.resolve([]))
        });
    });

    describe('metrics-usage', () => {
        it('should include $project stage with required fields', async () => {
            await usageHandler(baseReq, mockRes());

            const pipeline = ChatModel.Chat.aggregate.mock.calls[0][0];
            const projectStages = extractProjectStages(pipeline);

            expect(projectStages.length).toBeGreaterThanOrEqual(1);

            // First $project should have minimal fields for aggregation
            const firstProject = projectStages[0];
            const fields = getProjectFields(firstProject);

            expect(fields).toContain('pageLanguage');
            expect(fields).toContain('chatId');
        });
    });

    describe('metrics-expert-feedback', () => {
        it('should include $project stage with required fields', async () => {
            await expertHandler(baseReq, mockRes());

            const pipeline = ChatModel.Chat.aggregate.mock.calls[0][0];
            const projectStages = extractProjectStages(pipeline);

            expect(projectStages.length).toBeGreaterThanOrEqual(1);

            const fields = getProjectFields(projectStages[0]);

            // Required for aggregation
            expect(fields).toContain('pageLanguage');
            expect(fields).toContain('category');
            // Required for cross-filters
            expect(fields).toContain('answerId');
            expect(fields).toContain('autoEvalId');
        });
    });

    describe('metrics-ai-eval', () => {
        it('should include $project stage with required fields', async () => {
            await aiEvalHandler(baseReq, mockRes());

            const pipeline = ChatModel.Chat.aggregate.mock.calls[0][0];
            const projectStages = extractProjectStages(pipeline);

            expect(projectStages.length).toBeGreaterThanOrEqual(1);

            const fields = getProjectFields(projectStages[0]);

            expect(fields).toContain('pageLanguage');
            expect(fields).toContain('category');
            expect(fields).toContain('answerId');
            expect(fields).toContain('expertFeedbackId');
        });
    });

    describe('metrics-public-feedback', () => {
        it('should include $project stage with required fields in all 3 pipelines', async () => {
            await publicFeedbackHandler(baseReq, mockRes());

            // Public feedback runs 3 parallel queries
            expect(ChatModel.Chat.aggregate).toHaveBeenCalledTimes(3);

            // Check each pipeline has correct projections
            for (let i = 0; i < 3; i++) {
                const pipeline = ChatModel.Chat.aggregate.mock.calls[i][0];
                const projectStages = extractProjectStages(pipeline);

                expect(projectStages.length).toBeGreaterThanOrEqual(1);

                const fields = getProjectFields(projectStages[0]);

                expect(fields).toContain('pageLanguage');
                expect(fields).toContain('publicFeedback');
                expect(fields).toContain('answerId');
            }
        });
    });

    describe('metrics-departments', () => {
        it('should include $project stage with required fields', async () => {
            await departmentsHandler(baseReq, mockRes());

            const pipeline = ChatModel.Chat.aggregate.mock.calls[0][0];
            const projectStages = extractProjectStages(pipeline);

            expect(projectStages.length).toBeGreaterThanOrEqual(1);

            const fields = getProjectFields(projectStages[0]);

            expect(fields).toContain('department');
            expect(fields).toContain('hasExpertFeedback');
            expect(fields).toContain('category');
            expect(fields).toContain('answerId');
            expect(fields).toContain('autoEvalId');
        });
    });
});
