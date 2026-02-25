import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Chat } from '../models/chat.js';
import chatDashboardHandler from '../api/chat/chat-dashboard.js';
import { getChatFilterConditions } from '../api/util/chat-filters.js';

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

describe('getChatFilterConditions - referredPublic regex', () => {
    /**
     * Helper: extract the inclusion regex string from referredPublic conditions
     */
    function getInclusionRegex() {
        const conditions = getChatFilterConditions({ userType: 'referredPublic' });
        const inclusion = conditions.find(c =>
            c['interactions.referringUrl'] && c['interactions.referringUrl'].$regex
        );
        return new RegExp(inclusion['interactions.referringUrl'].$regex, inclusion['interactions.referringUrl'].$options);
    }

    /**
     * Helper: extract the exclusion regex string from referredPublic conditions
     */
    function getExclusionRegex() {
        const conditions = getChatFilterConditions({ userType: 'referredPublic' });
        const exclusion = conditions.find(c =>
            c['interactions.referringUrl'] && c['interactions.referringUrl'].$not
        );
        return new RegExp(exclusion['interactions.referringUrl'].$not.$regex, exclusion['interactions.referringUrl'].$not.$options);
    }

    describe('inclusion regex (canada.ca / gc.ca at domain boundary)', () => {
        it.each([
            ['https://www.canada.ca/', true],
            ['https://www.canada.ca/en/services/benefits', true],
            ['https://ised-isde.canada.ca/site/spectrum', true],
            ['https://sac-isc.gc.ca/eng/home', true],
            ['https://rcaanc-cirnac.gc.ca/eng/1100100010002', true],
            ['https://canada.ca/', true],
            ['https://some.deep.sub.canada.ca/path', true],
            ['canada.ca/en/services', true],
            ['gc.ca/eng/home', true],
        ])('should MATCH: %s', (url, expected) => {
            expect(getInclusionRegex().test(url)).toBe(expected);
        });

        it.each([
            ['https://statics.teams.cdn.office.net/', false],
            ['android-app://com.slack/', false],
            ['https://github.com/cds-snc/ai-answers', false],
            ['https://coveord.atlassian.net/browse/SFINT', false],
            ['https://linkedin.com/feed', false],
            ['https://canada-preview.adobecqms.net/content', false],
            ['', false],
        ])('should NOT match: %s', (url, expected) => {
            expect(getInclusionRegex().test(url)).toBe(expected);
        });
    });

    describe('exclusion regex (CDS/internal subdomains)', () => {
        it.each([
            // English CDS sites
            ['https://blog.canada.ca/2024/01/post', true],
            ['https://digital.canada.ca/products', true],
            ['https://design.canada.ca/common-design-patterns', true],
            // French CDS sites
            ['https://blogue.canada.ca/2024/01/article', true],
            ['https://numerique.canada.ca/produits', true],
            ['https://conception.canada.ca/', true],
            // Pre-production / internal
            ['https://alpha.canada.ca/en', true],
            ['https://ai-answers.alpha.canada.ca/en/chat', true],
            ['https://staging.canada.ca/en', true],
            // Test wildcard
            ['https://test.canada.ca/', true],
            ['https://loadtest.canada.ca/', true],
            ['https://perftest99.canada.ca/', true],
            // Without protocol prefix (as stored in some pipelines)
            ['design.canada.ca', true],
            ['design.canada.ca/', true],
            ['blog.canada.ca/2024/post', true],
            ['conception.canada.ca/', true],
            ['test.canada.ca/', true],
        ])('should EXCLUDE: %s', (url, expected) => {
            expect(getExclusionRegex().test(url)).toBe(expected);
        });

        it.each([
            ['https://www.canada.ca/en/services', false],
            ['https://ised-isde.canada.ca/site/spectrum', false],
            ['https://sac-isc.gc.ca/eng/home', false],
        ])('should NOT exclude: %s', (url, expected) => {
            expect(getExclusionRegex().test(url)).toBe(expected);
        });
    });

    describe('user condition and skipUserCondition', () => {
        it('should include user $exists:false for referredPublic by default', () => {
            const conditions = getChatFilterConditions({ userType: 'referredPublic' });
            const userCond = conditions.find(c => c.user);
            expect(userCond).toEqual({ user: { $exists: false } });
        });

        it('should skip user condition when skipUserCondition is true', () => {
            const conditions = getChatFilterConditions(
                { userType: 'referredPublic' },
                { skipUserCondition: true }
            );
            const userCond = conditions.find(c => c.user);
            expect(userCond).toBeUndefined();
            // Should still have the referringUrl conditions
            const urlConds = conditions.filter(c => c['interactions.referringUrl']);
            expect(urlConds).toHaveLength(2);
        });

        it('should skip user condition for public when skipUserCondition is true', () => {
            const conditions = getChatFilterConditions(
                { userType: 'public' },
                { skipUserCondition: true }
            );
            expect(conditions).toHaveLength(0);
        });

        it('should skip user condition for admin when skipUserCondition is true', () => {
            const conditions = getChatFilterConditions(
                { userType: 'admin' },
                { skipUserCondition: true }
            );
            expect(conditions).toHaveLength(0);
        });
    });
});
