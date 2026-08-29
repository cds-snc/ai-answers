import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import handler from '../api/eval/eval-dashboard.js';

import { Chat } from '../models/chat.js';
import { Interaction } from '../models/interaction.js';
import { Context } from '../models/context.js';
import { Answer } from '../models/answer.js';
import { Tool } from '../models/tool.js';
import { User } from '../models/user.js';

vi.mock('../middleware/auth.js', () => ({
    withProtection: (fn) => fn,
    authMiddleware: (req, res, next) => next(),
    adminMiddleware: (req, res, next) => next(),
    partnerOrAdminMiddleware: (req, res, next) => next()
}));

vi.mock('../api/db/db-connect.js', () => ({
    default: async () => { }
}));

// Regression coverage for the hasDownload 'success' | 'partial' | 'failed' | ''
// $switch in api/eval/eval-dashboard.js. The existing unit test for this
// endpoint (__tests__/api.eval-dashboard.filters.test.js) mocks
// Chat.aggregate to return [] and only string-matches the pipeline shape, so
// it can't catch a broken $switch branch or a wrong $$tool.tool filter - this
// seeds real Tool docs through a real aggregation to verify the classification
// itself.
describe('Integration: eval-dashboard hasDownload status', () => {
    let mongoServer;
    const dateRange = {
        startDate: '2020-01-01',
        endDate: '2030-01-01',
    };

    const makeTool = (error) => Tool.create({ tool: 'downloadWebPage', status: error === 'none' ? 'completed' : 'error', error });

    // toolErrors: array of 'none' (succeeded) / anything else (failed) for
    // each downloadWebPage call on this interaction's answer. Empty array =
    // no downloads attempted at all.
    const makeInteraction = async (chatId, toolErrors) => {
        const context = await Context.create({ pageLanguage: 'en', department: 'IRCC' });
        const tools = await Promise.all(toolErrors.map(makeTool));
        const answer = await Answer.create({
            content: 'Test answer',
            answerType: 'normal',
            tools: tools.map((t) => t._id),
        });
        return Interaction.create({
            context: context._id,
            answer: answer._id,
            question: new mongoose.Types.ObjectId(),
            createdAt: new Date(),
        });
    };

    beforeAll(async () => {
        mongoServer = await MongoMemoryServer.create();
        await mongoose.connect(mongoServer.getUri());
    }, 60000);

    afterAll(async () => {
        await mongoose.disconnect();
        await mongoServer.stop();
    });

    // The project's global test setup (test/vitest-hooks.js) clears every
    // collection on the active mongoose connection before each test - so
    // seeding has to happen here, in a beforeEach that runs after that
    // global one, not once in beforeAll (which would get wiped before the
    // first test body ever runs).
    beforeEach(async () => {
        const user = await User.create({ email: 'reviewer@example.com', password: 'password123' });

        const [success, partial, fail, none] = await Promise.all([
            makeInteraction('chat-success', ['none', 'none']),
            makeInteraction('chat-partial', ['none', 'download failed: timeout']),
            makeInteraction('chat-fail', ['download failed: timeout']),
            makeInteraction('chat-none', []),
        ]);

        await Promise.all([
            Chat.create({ chatId: 'chat-success', user: user._id, interactions: [success._id], createdAt: new Date(), pageLanguage: 'en' }),
            Chat.create({ chatId: 'chat-partial', user: user._id, interactions: [partial._id], createdAt: new Date(), pageLanguage: 'en' }),
            Chat.create({ chatId: 'chat-fail', user: user._id, interactions: [fail._id], createdAt: new Date(), pageLanguage: 'en' }),
            Chat.create({ chatId: 'chat-none', user: user._id, interactions: [none._id], createdAt: new Date(), pageLanguage: 'en' }),
        ]);
    });

    const callHandler = async (query) => {
        const req = { method: 'GET', query: { ...dateRange, ...query } };
        let jsonBody;
        const res = {
            status: vi.fn().mockReturnThis(),
            json: vi.fn((body) => { jsonBody = body; return res; }),
        };
        await handler(req, res);
        return jsonBody;
    };

    it('classifies every download outcome correctly', async () => {
        const body = await callHandler({});
        const byChatId = Object.fromEntries(body.rows.map((r) => [r.chatId, r.hasDownload]));

        expect(byChatId['chat-success']).toBe('success');
        expect(byChatId['chat-partial']).toBe('partial');
        expect(byChatId['chat-fail']).toBe('failed');
        expect(byChatId['chat-none']).toBe('');
    });

    // Regression: free-text "yes"/"no" used to be interpreted as a literal
    // boolean and OR'd against hasAutoEval, hasExpertEval, processed,
    // hasMatches, AND hasDownload (mapped to success/partial vs fail/'').
    // Those first four fields are false/blank for most rows in real data
    // (most questions aren't expert-reviewed, most have no download
    // attempt), so that shortcut made "no" match almost every row in the
    // table instead of narrowing anything down. It's been removed - "yes"/
    // "no" now only match literal text (e.g. the Public feedback column,
    // which genuinely stores 'yes'/'no' as its value), and hasDownload/
    // Processed/Has matches/etc. are reachable only via their own filter
    // dropdowns, not free text.
    it('does not match hasDownload via a "yes"/"no" boolean shortcut anymore', async () => {
        const yesBody = await callHandler({ search: 'yes' });
        expect(yesBody.rows.map((r) => r.chatId)).not.toContain('chat-success');
        expect(yesBody.rows.map((r) => r.chatId)).not.toContain('chat-partial');

        const noBody = await callHandler({ search: 'no' });
        expect(noBody.rows.map((r) => r.chatId)).not.toContain('chat-fail');
        // chat-none is a coincidence of this test's own chatId naming (it
        // literally contains the substring "no" in "noNe"), not the
        // hasDownload shortcut - still a legitimate plain-text chatId match.
        expect(noBody.rows.map((r) => r.chatId)).toContain('chat-none');
    });

    it('finds only the partial row via a column search, without being coerced to a boolean', async () => {
        const body = await callHandler({ columnSearch: JSON.stringify({ hasDownload: 'partial' }) });
        const chatIds = body.rows.map((r) => r.chatId);

        expect(chatIds).toEqual(['chat-partial']);
    });
});
