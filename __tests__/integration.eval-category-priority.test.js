import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import {
    getPartnerEvalAggregationExpression,
    getAiEvalAggregationExpression,
    getHasCitationErrorAggregationExpression,
    getChatFilterConditions,
    deriveExpertFeedbackCategory
} from '../api/util/chat-filters.js';
import { buildMetricsEvalFilter, remapEvalFilter } from '../api/metrics/metrics-common.js';

// Priority: harmful > hasError > needsImprovement > hasCitationError > correct.
// A citation issue only counts when every sentence is correct (issue #1902).
const CASES = [
    { name: 'harmful beats error and citation', ef: { sentence1Harmful: true, sentence1Score: 0, citationScore: 0, totalScore: 0 }, expected: 'harmful' },
    { name: 'incorrect sentence + citation error', ef: { sentence1Score: 0, sentence2Score: 100, citationScore: 0, totalScore: 0 }, expected: 'hasError' },
    { name: 'incorrect sentence + citation needs improvement', ef: { sentence1Score: 0, citationScore: 20, totalScore: 0 }, expected: 'hasError' },
    { name: 'incorrect sentence beats needs-improvement sentence', ef: { sentence1Score: 80, sentence2Score: 0, citationScore: 25, totalScore: 0 }, expected: 'hasError' },
    { name: 'needs-improvement sentence + citation error', ef: { sentence1Score: 80, sentence2Score: 100, citationScore: 0, totalScore: 70 }, expected: 'needsImprovement' },
    { name: 'needs-improvement sentence + citation needs improvement', ef: { sentence1Score: 80, citationScore: 20, totalScore: 80 }, expected: 'needsImprovement' },
    { name: 'all sentences correct + citation error', ef: { sentence1Score: 100, sentence2Score: 100, citationScore: 0, totalScore: 75 }, expected: 'hasCitationError' },
    { name: 'all sentences correct + citation needs improvement', ef: { sentence1Score: 100, citationScore: 20, totalScore: 95 }, expected: 'hasCitationError' },
    { name: 'all correct', ef: { sentence1Score: 100, citationScore: 25, totalScore: 100 }, expected: 'correct' }
];

describe('eval category priority (aggregation expressions + JS mirror)', () => {
    let mongoServer;
    let rows;

    beforeAll(async () => {
        mongoServer = await MongoMemoryServer.create();
        await mongoose.connect(mongoServer.getUri());
        const coll = mongoose.connection.db.collection('categoryPriorityCases');
        await coll.insertMany(CASES.map((c, i) => ({ i, ef: c.ef, autoEval: { expertFeedback: c.ef } })));
        rows = await coll.aggregate([
            { $sort: { i: 1 } },
            {
                $project: {
                    partner: getPartnerEvalAggregationExpression('$ef'),
                    ai: getAiEvalAggregationExpression('$autoEval.expertFeedback')
                }
            }
        ]).toArray();
    });

    afterAll(async () => {
        await mongoose.disconnect();
        await mongoServer.stop();
    });

    CASES.forEach((c, i) => {
        it(`${c.name} → ${c.expected}`, () => {
            expect(rows[i].partner).toBe(c.expected);
            expect(rows[i].ai).toBe(c.expected);
            expect(deriveExpertFeedbackCategory(c.ef)).toBe(c.expected);
        });
    });
});

// "Citation issue" in any filter means every answer with a citation problem,
// whatever its sentences scored - not just the hasCitationError bucket.
describe('citation issue filter catches answers in other buckets', () => {
    let mongoServer;
    let coll;
    const DOCS = [
        { name: 'errorWithBadCitation', ef: { sentence1Score: 0, citationScore: 0, totalScore: 0 } },
        { name: 'needsImprovementWithBadCitation', ef: { sentence1Score: 80, citationScore: 20, totalScore: 80 } },
        { name: 'citationOnly', ef: { sentence1Score: 100, citationScore: 0, totalScore: 75 } },
        { name: 'errorGoodCitation', ef: { sentence1Score: 0, citationScore: 25, totalScore: 0 } },
        { name: 'correct', ef: { sentence1Score: 100, citationScore: 25, totalScore: 100 } }
    ];

    beforeAll(async () => {
        mongoServer = await MongoMemoryServer.create();
        await mongoose.connect(mongoServer.getUri());
        coll = mongoose.connection.db.collection('citationFilterCases');
        await coll.insertMany(DOCS.map((d) => ({ name: d.name, interactions: { expertFeedback: d.ef, autoEval: { expertFeedback: d.ef } } })));
    });

    afterAll(async () => {
        await mongoose.disconnect();
        await mongoServer.stop();
    });

    const names = (rows) => rows.map((r) => r.name).sort();

    it('chat/export/log filters (getChatFilterConditions)', async () => {
        const run = async (filters) => coll.aggregate([
            {
                $addFields: {
                    'interactions.partnerEval': getPartnerEvalAggregationExpression(),
                    'interactions.aiEval': getAiEvalAggregationExpression(),
                    'interactions.partnerHasCitationError': getHasCitationErrorAggregationExpression(),
                    'interactions.aiHasCitationError': getHasCitationErrorAggregationExpression('$interactions.autoEval.expertFeedback')
                }
            },
            { $match: { $and: getChatFilterConditions(filters) } }
        ]).toArray();

        const allCitation = ['citationOnly', 'errorWithBadCitation', 'needsImprovementWithBadCitation'];
        expect(names(await run({ partnerEval: 'hasCitationError' }))).toEqual(allCitation);
        expect(names(await run({ aiEval: 'hasCitationError' }))).toEqual(allCitation);
        expect(names(await run({ partnerEval: 'hasError' }))).toEqual(['errorGoodCitation', 'errorWithBadCitation']);
    });

    it('metrics filters (buildMetricsEvalFilter + remapEvalFilter)', async () => {
        const run = async (raw, prefix) => {
            const filter = buildMetricsEvalFilter(raw);
            const categoryField = prefix ? `${prefix}Category` : 'category';
            const citationField = prefix ? `${prefix}HasCitationError` : 'hasCitationError';
            return coll.aggregate([
                {
                    $addFields: {
                        [categoryField]: getPartnerEvalAggregationExpression(),
                        [citationField]: getHasCitationErrorAggregationExpression()
                    }
                },
                { $match: prefix ? remapEvalFilter(filter, prefix) : filter }
            ]).toArray();
        };

        const allCitation = ['citationOnly', 'errorWithBadCitation', 'needsImprovementWithBadCitation'];
        expect(names(await run('hasCitationError'))).toEqual(allCitation);
        expect(names(await run('hasCitationError', 'ai'))).toEqual(allCitation);
        expect(names(await run('hasError'))).toEqual(['errorGoodCitation', 'errorWithBadCitation']);
        expect(names(await run('hasCitationError,correct', 'partner'))).toEqual([...allCitation, 'correct'].sort());
    });
});
