import { describe, expect, it } from 'vitest';
import {
    toCompactRow,
    computeStats,
    buildCrossTab,
    combinedLabel,
    MIN_EVALS_FOR_FLAG
} from '../evalAnalysisStats.js';
import { deriveExpertFeedbackCategory as deriveCategory } from '../../api/util/chat-filters.js';

const feedback = (overrides = {}) => ({
    totalScore: 100,
    sentence1Score: 100,
    citationScore: 25,
    expertEmail: 'a@x.ca',
    ...overrides
});

const row = (overrides = {}) => ({
    id: 'i1',
    chatId: 'c1',
    q: 'q',
    lang: 'en',
    ref: '',
    cite: '',
    score: 100,
    category: 'correct',
    contentIssue: false,
    harmful: false,
    expl: '',
    citeExpl: '',
    improve: '',
    evaluator: 'a@x.ca',
    createdAt: null,
    topic: null,
    action: null,
    ...overrides
});

describe('deriveExpertFeedbackCategory (mirrors getPartnerEvalAggregationExpression)', () => {
    it('returns null for missing/scoreless feedback', () => {
        expect(deriveCategory(null)).toBeNull();
        expect(deriveCategory({})).toBeNull();
        expect(deriveCategory({ sentence1Explanation: 'text only' })).toBeNull();
    });

    it('prioritizes harmful over everything', () => {
        expect(deriveCategory(feedback({ sentence2Harmful: true, sentence1Score: 0, citationScore: 0 }))).toBe('harmful');
    });

    it('prioritizes citation error over answer error', () => {
        expect(deriveCategory(feedback({ citationScore: 20, sentence1Score: 0 }))).toBe('hasCitationError');
        expect(deriveCategory(feedback({ citationScore: 0 }))).toBe('hasCitationError');
    });

    it('citation score 25 is not a citation error', () => {
        expect(deriveCategory(feedback({ citationScore: 25 }))).toBe('correct');
    });

    it('detects answer error from any sentence score 0 or totalScore 0', () => {
        expect(deriveCategory(feedback({ sentence3Score: 0 }))).toBe('hasError');
        expect(deriveCategory(feedback({ totalScore: 0, sentence1Score: 0 }))).toBe('hasError');
    });

    it('detects needsImprovement from sentence score 80', () => {
        expect(deriveCategory(feedback({ sentence2Score: 80, totalScore: 92.5 }))).toBe('needsImprovement');
    });

    it('weighted totalScore below 100 without an 80/0 sentence is uncategorized', () => {
        // e.g. citation-only deduction handled above; scores like 95 with all
        // sentences 100 come from citation weighting — category stays null
        // unless a rule matches (same as the aggregation expression).
        expect(deriveCategory(feedback({ totalScore: 95 }))).toBeNull();
    });
});

describe('toCompactRow', () => {
    it('builds a compact row with joined explanations and flags', () => {
        const compact = toCompactRow({
            _id: 'abc',
            chatId: 'chat1',
            question: 'What is my deadline?',
            pageLanguage: 'fr',
            referringUrl: 'https://canada.ca/page',
            citationUrl: 'https://canada.ca/cite',
            createdAt: '2026-05-26T11:12:46.057Z',
            expertFeedback: feedback({
                sentence2Score: 80,
                sentence2Explanation: 'Confusing wording',
                sentence2ContentIssue: true,
                totalScore: 92.5,
                answerImprovement: 'Reorder sentences',
                expertEmail: 'eval@x.ca'
            })
        });
        expect(compact).toMatchObject({
            id: 'abc',
            lang: 'fr',
            score: 92.5,
            category: 'needsImprovement',
            contentIssue: true,
            harmful: false,
            expl: 'S2: Confusing wording',
            improve: 'Reorder sentences',
            evaluator: 'eval@x.ca',
            topic: null,
            action: null
        });
    });

    it('treats missing totalScore as unscored', () => {
        const compact = toCompactRow({ _id: 'x', expertFeedback: { expertEmail: 'e@x.ca' } });
        expect(compact.score).toBeNull();
        expect(compact.category).toBeNull();
    });
});

describe('computeStats', () => {
    it('computes overall, per-language and per-evaluator summaries', () => {
        const rows = [
            row({ score: 100, category: 'correct', evaluator: 'a@x.ca' }),
            row({ score: 100, category: 'correct', evaluator: 'a@x.ca', lang: 'fr' }),
            row({ score: 80, category: 'needsImprovement', evaluator: 'b@x.ca', contentIssue: true }),
            row({ score: null, category: null, evaluator: 'b@x.ca' })
        ];
        const stats = computeStats(rows);
        expect(stats.total).toBe(4);
        expect(stats.scoredCount).toBe(3);
        expect(stats.excludedCount).toBe(1);
        expect(stats.pctPerfect).toBe(67);
        expect(stats.categories.correct).toBe(2);
        expect(stats.categories.needsImprovement).toBe(1);
        expect(stats.contentIssueCount).toBe(1);
        expect(stats.byLanguage.fr.count).toBe(1);
        expect(stats.byLanguage.en.count).toBe(3);
        const a = stats.evaluators.find((e) => e.email === 'a@x.ca');
        expect(a.count).toBe(2);
        expect(a.pctPerfect).toBe(100);
    });

    it('flags both sides of a two-evaluator divergence (symmetric on purpose)', () => {
        const rows = [];
        // 20 perfect evals from one evaluator
        for (let i = 0; i < 20; i++) rows.push(row({ evaluator: 'group@x.ca' }));
        // another evaluator with enough volume scoring mostly non-perfect
        for (let i = 0; i < MIN_EVALS_FOR_FLAG; i++) {
            rows.push(row({ evaluator: 'strict@x.ca', score: 80, category: 'needsImprovement' }));
        }
        const stats = computeStats(rows);
        const strict = stats.evaluators.find((e) => e.email === 'strict@x.ca');
        expect(strict.flagged).toBe(true);
        expect(strict.deltaPctPerfect).toBe(-100);
        expect(stats.anyEvaluatorFlagged).toBe(true);
        // The stats can't tell which side is the outlier — both get flagged.
        const group = stats.evaluators.find((e) => e.email === 'group@x.ca');
        expect(group.flagged).toBe(true);
        expect(group.deltaPctPerfect).toBe(100);
    });

    it('can flag the highest-volume evaluator (a rubber-stamper is not exempt)', () => {
        const rows = [];
        // majority evaluator rubber-stamps 150 perfect scores
        for (let i = 0; i < 150; i++) rows.push(row({ evaluator: 'busy@x.ca' }));
        // 30 evals at a normal ~60% perfect rate from a second evaluator
        for (let i = 0; i < 30; i++) {
            rows.push(i % 5 < 3
                ? row({ evaluator: 'normal@x.ca' })
                : row({ evaluator: 'normal@x.ca', score: 80, category: 'needsImprovement' }));
        }
        const stats = computeStats(rows);
        const busy = stats.evaluators.find((e) => e.email === 'busy@x.ca');
        expect(busy.deltaPctPerfect).toBeGreaterThan(20);
        expect(busy.flagged).toBe(true);
    });

    it('does not flag small-volume evaluators', () => {
        const rows = [];
        for (let i = 0; i < 20; i++) rows.push(row({ evaluator: 'group@x.ca' }));
        rows.push(row({ evaluator: 'once@x.ca', score: 0, category: 'hasError' }));
        const stats = computeStats(rows);
        const once = stats.evaluators.find((e) => e.email === 'once@x.ca');
        expect(once.flagged).toBe(false);
    });
});

describe('combinedLabel', () => {
    it('joins topic and action, dropping an uninformative half', () => {
        expect(combinedLabel(row({ topic: 'Canada child benefit', action: 'Change my contact information' })))
            .toBe('Canada child benefit — Change my contact information');
        expect(combinedLabel(row({ topic: 'Canada child benefit', action: 'Other' }))).toBe('Canada child benefit');
        expect(combinedLabel(row({ topic: 'Other', action: 'Apply' }))).toBe('Apply');
        expect(combinedLabel(row({ topic: 'Other', action: 'Other' }))).toBe('Other');
    });
});

describe('buildCrossTab', () => {
    it('tabulates categories per combined topic—action group, worst-first', () => {
        const rows = [
            row({ topic: 'Pensions', action: 'Apply' }),
            row({ topic: 'Pensions', action: 'Apply' }),
            row({ topic: 'Treaties', action: 'Search', score: 0, category: 'hasError' }),
            row({ topic: 'Treaties', action: 'Search' }),
            row({ topic: null, action: null })
        ];
        const tab = buildCrossTab(rows);
        expect(tab.unclassifiedCount).toBe(1);
        expect(tab.groups[0].label).toBe('Treaties — Search');
        expect(tab.groups[0].nonPerfectCount).toBe(1);
        expect(tab.groups[0].pctNonPerfect).toBe(50);
        const pensions = tab.groups.find((g) => g.label === 'Pensions — Apply');
        expect(pensions.count).toBe(2);
        expect(pensions.alwaysPerfect).toBe(true);
        expect(tab.skippedSingles).toEqual({ groupCount: 0, rowCount: 0 });
    });

    it('drops single-evaluation groups from the table and counts them aside', () => {
        const rows = [
            row({ topic: 'Pensions', action: 'Apply' }),
            row({ topic: 'Pensions', action: 'Apply' }),
            row({ topic: 'Pensions', action: 'Renew', score: 0, category: 'hasError' }),
            row({ topic: 'Treaties', action: 'Search' })
        ];
        const tab = buildCrossTab(rows);
        expect(tab.groups.map((g) => g.label)).toEqual(['Pensions — Apply']);
        expect(tab.skippedSingles).toEqual({ groupCount: 2, rowCount: 2 });
    });
});
