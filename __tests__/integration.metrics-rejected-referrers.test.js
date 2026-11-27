import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import getReferralMetrics from '../api/metrics/metrics-referrals.js';

import { Chat } from '../models/chat.js';
import { Interaction } from '../models/interaction.js';
import { Context } from '../models/context.js';

vi.mock('../middleware/auth.js', async () => ({
    withProtection: (fn) => fn,
    authMiddleware: (req, res, next) => next(),
    adminMiddleware: (req, res, next) => next(),
    partnerOrAdminMiddleware: (req, res, next) => next()
}));

vi.mock('../api/db/db-connect.js', () => ({
    default: async () => { }
}));

const call = (query) => new Promise((resolve) => {
    const res = { status: (code) => ({ json: (data) => resolve({ code, data }) }) };
    getReferralMetrics({ method: 'GET', query: { startDate: '2026-08-01', endDate: '2026-08-31', ...query } }, res);
});

// One chat whose questions all came from `host`, in `department`.
async function chatFrom(chatId, host, { questions = 1, department = 'CRA-ARC', createdAt = new Date('2026-08-10') } = {}) {
    const ctx = await Context.create({ department });
    const ids = [];
    for (let i = 0; i < questions; i += 1) {
        const interaction = await Interaction.create({ referringUrl: '', rejectedReferrerHost: host, context: ctx._id });
        ids.push(interaction._id);
    }
    await Chat.create({ chatId, interactions: ids, pageLanguage: 'en', createdAt });
}

// AIA-006 follow-up: hostnames of non-GC referrers dropped for signed-out visitors.
describe('Integration: metrics-referrals rejectedHosts', () => {
    let mongoServer;

    beforeAll(async () => {
        mongoServer = await MongoMemoryServer.create();
        await mongoose.connect(mongoServer.getUri());
    }, 60000);

    // test/vitest-hooks.js resets the database before every test.
    beforeEach(async () => {
        await chatFrom('g1', 'google.com', { questions: 3 });
        await chatFrom('g2', 'google.com');
        await chatFrom('b1', 'bing.com', { department: 'IRCC' });
        await chatFrom('old', 'old.example', { createdAt: new Date('2026-06-01') });
        // A kept GC referrer has no rejected host and must not be counted.
        await Chat.create({
            chatId: 'gc',
            interactions: [(await Interaction.create({ referringUrl: 'https://www.canada.ca/en.html' }))._id],
            createdAt: new Date('2026-08-10'),
        });
    });

    afterAll(async () => {
        await mongoose.disconnect();
        await mongoServer.stop();
    });

    it('counts distinct conversations per host, within the date range', async () => {
        const { code, data } = await call({});
        expect(code).toBe(200);
        expect(data.metrics.rejectedHosts).toEqual([
            { host: 'google.com', count: 2 },
            { host: 'bing.com', count: 1 },
        ]);
        // Rejected referrers never show up as top referral pages.
        expect(data.metrics.topReferrals).toEqual([{ url: 'canada.ca/en.html', count: 1 }]);
    });

    it('respects the department filter', async () => {
        const { data } = await call({ department: 'IRCC' });
        expect(data.metrics.rejectedHosts).toEqual([{ host: 'bing.com', count: 1 }]);
    });

    it('returns at most 20 hosts', async () => {
        for (let i = 0; i < 25; i += 1) await chatFrom(`many-${i}`, `site${i}.example`);
        const { data } = await call({});
        expect(data.metrics.rejectedHosts).toHaveLength(20);
        expect(data.metrics.rejectedHosts[0]).toEqual({ host: 'google.com', count: 2 });
    });
});
