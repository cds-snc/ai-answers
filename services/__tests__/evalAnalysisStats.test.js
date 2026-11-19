import { describe, expect, it } from 'vitest';
import {
    toCompactRow,
    computeStats,
    combinedLabelFrom,
    selectInsightRows,
    withQuestionDetails,
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
    program: null,
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

    it('prioritizes sentence scores over citation error', () => {
        expect(deriveCategory(feedback({ citationScore: 20, sentence1Score: 0 }))).toBe('hasError');
        expect(deriveCategory(feedback({ citationScore: 0, sentence1Score: 80 }))).toBe('needsImprovement');
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
            program: null,
            action: null
        });
    });

    it('treats missing totalScore as unscored', () => {
        const compact = toCompactRow({ _id: 'x', expertFeedback: { expertEmail: 'e@x.ca' } });
        expect(compact.score).toBeNull();
        expect(compact.category).toBeNull();
    });

    it('reuses a real stored program/action from the per-question classifier', () => {
        const compact = toCompactRow({
            _id: 'x',
            program: 'Canada Pension Plan',
            action: 'Apply',
            expertFeedback: {}
        });
        expect(compact.program).toBe('Canada Pension Plan');
        expect(compact.action).toBe('Apply');
    });

    it("normalizes '' and 'unknown' stored program/action to null (unclassified)", () => {
        expect(toCompactRow({ _id: 'x', program: '', action: '', expertFeedback: {} }).program).toBeNull();
        expect(toCompactRow({ _id: 'x', program: 'unknown', action: 'unknown', expertFeedback: {} }).program).toBeNull();
        expect(toCompactRow({ _id: 'x', program: 'unknown', expertFeedback: {} }).action).toBeNull();
    });

    it('leaves question and citation empty when the light query has no text', () => {
        const compact = toCompactRow({ _id: 'x', referringUrl: 'https://www.canada.ca/a', expertFeedback: {} });
        expect(compact.q).toBe('');
        expect(compact.cite).toBe('');
        expect(compact.ref).toBe('https://www.canada.ca/a');
    });
});

describe('withQuestionDetails', () => {
    it('adds truncated question and citation text to a compact row', () => {
        const enriched = withQuestionDetails(row({ q: '', cite: '' }), { question: 'x'.repeat(400), citationUrl: 'https://www.canada.ca/b' });
        expect(enriched.q).toHaveLength(301); // 300 + ellipsis
        expect(enriched.cite).toBe('https://www.canada.ca/b');
    });

    it('keeps the row as is when no details were found', () => {
        const original = row({ q: '', cite: '' });
        expect(withQuestionDetails(original, undefined)).toEqual(original);
    });
});

describe('selectInsightRows', () => {
    const at = (day) => `2026-10-${String(day).padStart(2, '0')}T00:00:00.000Z`;

    it('sends non-perfect rows only, errors first, then most recent', () => {
        const rows = [
            row({ id: 'perfect', score: 100, category: 'correct', createdAt: at(30) }),
            row({ id: 'ni-old', score: 90, category: 'needsImprovement', createdAt: at(1) }),
            row({ id: 'ni-new', score: 90, category: 'needsImprovement', createdAt: at(20) }),
            row({ id: 'err-old', score: 0, category: 'hasError', createdAt: at(2) }),
            row({ id: 'harm', score: 0, category: 'harmful', createdAt: at(3) }),
            row({ id: 'cite-err', score: 80, category: 'hasCitationError', createdAt: at(4) }),
            // Weighted total under 100 with no category is still non-perfect.
            row({ id: 'uncat', score: 96, category: null, createdAt: at(10) })
        ];
        const { lowScoreRows, nonPerfectTotal } = selectInsightRows(rows, 10);
        expect(lowScoreRows.map((r) => r.id)).toEqual(['cite-err', 'harm', 'err-old', 'ni-new', 'uncat', 'ni-old']);
        expect(nonPerfectTotal).toBe(6);
    });

    it('caps what it sends but reports the full count', () => {
        const rows = Array.from({ length: 5 }, (_, i) => row({ id: `r${i}`, score: 90, category: 'needsImprovement', createdAt: at(i + 1) }));
        const { lowScoreRows, nonPerfectTotal } = selectInsightRows(rows, 3);
        expect(lowScoreRows.map((r) => r.id)).toEqual(['r4', 'r3', 'r2']);
        expect(nonPerfectTotal).toBe(5);
    });

    it('selects content-issue rows separately, including perfect-scored ones', () => {
        const rows = [
            row({ id: 'ci-perfect', score: 100, category: 'correct', contentIssue: true, createdAt: at(5) }),
            row({ id: 'ci-low', score: 90, category: 'needsImprovement', contentIssue: true, createdAt: at(6) }),
            row({ id: 'plain', score: 100, category: 'correct', createdAt: at(7) })
        ];
        const { contentIssueRows, contentIssueTotal } = selectInsightRows(rows, 10);
        expect(contentIssueRows.map((r) => r.id)).toEqual(['ci-low', 'ci-perfect']);
        expect(contentIssueTotal).toBe(2);
    });

    it('returns empty lists when nothing needs analysis', () => {
        expect(selectInsightRows([row()], 10)).toEqual({
            lowScoreRows: [], nonPerfectTotal: 0, contentIssueRows: [], contentIssueTotal: 0
        });
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

describe('combinedLabelFrom', () => {
    it('joins program and action, keeping whichever half is present', () => {
        expect(combinedLabelFrom('Canada child benefit', 'Change my contact information'))
            .toBe('Canada child benefit — Change my contact information');
        expect(combinedLabelFrom('Canada child benefit', null)).toBe('Canada child benefit');
        expect(combinedLabelFrom(null, 'Apply')).toBe('Apply');
        expect(combinedLabelFrom(null, null)).toBe('Other');
    });
});
