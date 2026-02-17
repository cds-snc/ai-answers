import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Chat } from '../models/chat.js';
import chatDashboardHandler from '../api/chat/chat-dashboard.js';

vi.mock('../middleware/auth.js', () => ({
    withProtection: (handler) => (req, res) => handler(req, res),
    authMiddleware: {},
    partnerOrAdminMiddleware: {}
}));
vi.mock('../api/db/db-connect.js', () => ({ default: vi.fn() }));
vi.mock('../models/chat.js', () => ({
    Chat: {
        aggregate: vi.fn(() => ({
            allowDiskUse: vi.fn(() => Promise.resolve([]))
        }))
    }
}));

describe('Chat Dashboard API - Referring URL Filter', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should include referringUrl regex in the aggregation pipeline when filtered', async () => {
        const req = {
            method: 'GET',
            query: {
                startDate: '2025-01-01',
                endDate: '2025-01-02',
                referringUrl: 'canada.ca/en/services'
            }
        };
        const res = {
            status: vi.fn().mockReturnThis(),
            json: vi.fn()
        };

        await chatDashboardHandler(req, res);

        // Capture the pipeline passed to aggregate
        const pipeline = vi.mocked(Chat.aggregate).mock.calls[0][0];

        // Find the match stage that includes the referringUrl filter
        // Based on chat-dashboard.js, it uses getChatFilterConditions and pushes to a $match stage
        const matchStage = pipeline.find(stage => stage.$match && stage.$match.$and);
        expect(matchStage).toBeDefined();

        const referringUrlFilter = matchStage.$match.$and.find(cond =>
            cond['interactions.referringUrl'] && cond['interactions.referringUrl'].$regex
        );

        expect(referringUrlFilter).toBeDefined();
        expect(referringUrlFilter['interactions.referringUrl'].$regex).toContain('canada\\.ca/en/services');
    });
});
