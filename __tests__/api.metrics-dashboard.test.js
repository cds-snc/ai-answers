
import { describe, it, expect, vi } from 'vitest';
import handler from '../api/metrics/metrics-usage.js';
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

// Mock Mongoose Aggregate
ChatModel.Chat.aggregate = vi.fn().mockReturnValue(Promise.resolve([]));

describe('metrics-usage endpoint', () => {
    it('should handle request without 500', async () => {
        const req = {
            method: 'GET',
            query: {
                startDate: '2026-01-07T15:15:00.000Z',
                endDate: '2026-01-14T15:15:00.000Z',
                department: '',
                urlEn: '',
                urlFr: '',
                userType: 'all',
                answerType: 'all',
                partnerEval: 'all',
                aiEval: 'all'
            }
        };

        const res = {
            status: vi.fn().mockReturnThis(),
            json: vi.fn()
        };

        try {
            await handler(req, res);
        } catch (e) {
            console.error("Caught error:", e);
        }

        expect(res.status).toHaveBeenCalledWith(200);
    });

    it('should apply answerType filter to pipelines', async () => {
        // Reset mocks
        ChatModel.Chat.aggregate.mockClear();
        ChatModel.Chat.aggregate.mockReturnValue(Promise.resolve([]));

        const req = {
            method: 'GET',
            query: {
                startDate: '2026-01-07T00:00:00.000Z',
                endDate: '2026-01-14T00:00:00.000Z',
                answerType: 'normal'
            }
        };

        const res = {
            status: vi.fn().mockReturnThis(),
            json: vi.fn()
        };

        await handler(req, res);

        // Check that aggregate was called
        expect(ChatModel.Chat.aggregate).toHaveBeenCalledTimes(1);

        const pipeline = ChatModel.Chat.aggregate.mock.calls[0][0];
        const pipelineStr = JSON.stringify(pipeline);

        // Assert pipeline contains the filter
        expect(pipelineStr).toContain('"answerType":"normal"');
    });
});
