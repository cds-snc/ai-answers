// Pure Tier 1 helpers for the partner eval analysis. No DB or React — keep
// this module import-safe from tests and from EvalAnalysisService.
//
// Category semantics come from deriveExpertFeedbackCategory in
// api/util/chat-filters.js — the JS mirror of the aggregation expression the
// dashboards use, kept beside it so the analysis can't drift from them.

import { deriveExpertFeedbackCategory } from '../api/util/chat-filters.js';
import { OTHER_LABEL } from '../api/data/programActionSeeds.js';

const SENTENCE_NUMBERS = [1, 2, 3, 4];

// A stored program/action value is reusable only when it is a real program
// name — '' (never classified) and 'unknown' (classifier ran, not confident)
// both mean "no usable program" and are normalized to null.
const reusableValue = (value) => {
    const str = typeof value === 'string' ? value.trim() : '';
    return str && str.toLowerCase() !== 'unknown' ? str : null;
};

// An evaluator's perfect-rate must differ from the rest of the group by more
// than this many percentage points (with at least MIN_EVALS_FOR_FLAG evals)
// to be flagged as an anomaly. Deliberately plain — evaluation samples per
// institution are small, and heavier statistics would overpromise.
export const ANOMALY_THRESHOLD_PCT_POINTS = 20;
export const MIN_EVALS_FOR_FLAG = 10;

export const CATEGORY_KEYS = ['correct', 'needsImprovement', 'hasError', 'hasCitationError', 'harmful'];

const truncate = (value, max) => {
    const str = typeof value === 'string' ? value.trim() : '';
    return str.length > max ? `${str.slice(0, max)}…` : str;
};

// Joined per-sentence explanations, prefixed so the insight pass can tell
// which sentence a comment refers to: "S2: ...; S4: ...".
function joinExplanations(ef) {
    return SENTENCE_NUMBERS
        .map((n) => {
            const text = typeof ef[`sentence${n}Explanation`] === 'string' ? ef[`sentence${n}Explanation`].trim() : '';
            return text ? `S${n}: ${text}` : '';
        })
        .filter(Boolean)
        .join('; ');
}

// Compact row for the stats and the insights call. Built from the light
// query, which has no question or citation text: only rows sent to the
// insights call get those, through withQuestionDetails. Text fields are
// truncated to keep the insights request small.
export function toCompactRow(aggRow) {
    const ef = aggRow.expertFeedback || {};
    const score = typeof ef.totalScore === 'number' ? ef.totalScore : null;
    return {
        id: String(aggRow._id),
        chatId: aggRow.chatId || '',
        q: truncate(aggRow.question, 300),
        lang: aggRow.pageLanguage === 'fr' ? 'fr' : 'en',
        ref: truncate(aggRow.referringUrl, 200),
        cite: truncate(aggRow.citationUrl, 200),
        score,
        category: deriveExpertFeedbackCategory(ef),
        contentIssue: SENTENCE_NUMBERS.some((n) => ef[`sentence${n}ContentIssue`] === true),
        harmful: SENTENCE_NUMBERS.some((n) => ef[`sentence${n}Harmful`] === true),
        expl: truncate(joinExplanations(ef), 600),
        citeExpl: truncate(ef.citationExplanation, 300),
        improve: truncate(ef.answerImprovement, 400),
        evaluator: ef.expertEmail || '',
        createdAt: aggRow.createdAt ? new Date(aggRow.createdAt).toISOString() : null,
        // The per-question classifier's stored program/action, so the
        // analysis groups the same way the partner dashboard does. Rows
        // without one stay unclassified (no LLM classification here).
        program: reusableValue(aggRow.program),
        action: reusableValue(aggRow.action)
    };
}

// Adds the question and citation text fetched for the rows that go to the
// insights call. `details` is { question, citationUrl }, or undefined when
// the interaction wasn't found (the row is returned as is).
export function withQuestionDetails(row, details) {
    if (!details) return row;
    return {
        ...row,
        q: truncate(details.question, 300),
        cite: truncate(details.citationUrl, 200)
    };
}

// Most rows the insights call is sent per list. A limit on the model's
// input, not on the population: the stats always cover every evaluation.
export const MAX_INSIGHT_ROWS = 150;

export const isNonPerfect = (r) =>
    (r.score !== null && r.score < 100) || Boolean(r.category && r.category !== 'correct');

// Errors are what the team repairs first, so they're sent first.
const ERROR_CATEGORIES = new Set(['harmful', 'hasError', 'hasCitationError']);
const byPriorityThenRecent = (a, b) =>
    (ERROR_CATEGORIES.has(b.category) - ERROR_CATEGORIES.has(a.category)) ||
    (b.createdAt || '').localeCompare(a.createdAt || '');

// Picks the rows for the insights call: non-perfect and content-issue rows
// (a content issue can be flagged on a perfect score), each list errors
// first, then most recent, capped at `max`. The totals let the report say
// "based on N of M".
export function selectInsightRows(rows, max = MAX_INSIGHT_ROWS) {
    const nonPerfect = rows.filter(isNonPerfect);
    const contentIssue = rows.filter((r) => r.contentIssue);
    return {
        lowScoreRows: [...nonPerfect].sort(byPriorityThenRecent).slice(0, max),
        nonPerfectTotal: nonPerfect.length,
        contentIssueRows: [...contentIssue].sort(byPriorityThenRecent).slice(0, max),
        contentIssueTotal: contentIssue.length
    };
}

const emptyCategoryCounts = () => CATEGORY_KEYS.reduce((acc, key) => ({ ...acc, [key]: 0 }), {});

const round1 = (n) => Math.round(n * 10) / 10;

function summarizeGroup(rows) {
    const scored = rows.filter((r) => r.score !== null);
    const categories = emptyCategoryCounts();
    rows.forEach((r) => {
        if (r.category && categories[r.category] !== undefined) categories[r.category] += 1;
    });
    const perfect = rows.filter((r) => r.score === 100).length;
    return {
        count: rows.length,
        scoredCount: scored.length,
        perfectCount: perfect,
        meanScore: scored.length > 0 ? round1(scored.reduce((sum, r) => sum + r.score, 0) / scored.length) : null,
        pctPerfect: scored.length > 0 ? Math.round((perfect / scored.length) * 100) : null,
        categories,
        contentIssueCount: rows.filter((r) => r.contentIssue).length
    };
}

// Tier 1 stats over the compact rows. Everything here is deterministic and
// cheap; the LLM insight pass receives this object and must not contradict it.
export function computeStats(rows) {
    const overall = summarizeGroup(rows);
    const byLanguage = {
        en: summarizeGroup(rows.filter((r) => r.lang === 'en')),
        fr: summarizeGroup(rows.filter((r) => r.lang === 'fr'))
    };

    const byEvaluator = new Map();
    rows.forEach((r) => {
        const key = r.evaluator || '(unknown)';
        if (!byEvaluator.has(key)) byEvaluator.set(key, []);
        byEvaluator.get(key).push(r);
    });

    const evaluators = Array.from(byEvaluator.entries())
        .map(([email, evaluatorRows]) => {
            const summary = summarizeGroup(evaluatorRows);
            const others = rows.filter((r) => (r.evaluator || '(unknown)') !== email && r.score !== null);
            const othersPerfect = others.filter((r) => r.score === 100).length;
            const othersPctPerfect = others.length > 0 ? Math.round((othersPerfect / others.length) * 100) : null;
            const deltaPctPerfect =
                summary.pctPerfect !== null && othersPctPerfect !== null
                    ? summary.pctPerfect - othersPctPerfect
                    : null;
            return {
                email,
                ...summary,
                othersPctPerfect,
                deltaPctPerfect,
                // Flagging is deliberately symmetric: when two evaluators
                // diverge, both are flagged — the stats can't tell which one
                // is the outlier, and a minority-only rule would silently
                // exempt the highest-volume evaluator (the badge would then
                // point at the wrong person when the busiest grader is the
                // one rubber-stamping). "Review" means "look here", not
                // "this person is wrong".
                flagged:
                    summary.scoredCount >= MIN_EVALS_FOR_FLAG &&
                    deltaPctPerfect !== null &&
                    Math.abs(deltaPctPerfect) > ANOMALY_THRESHOLD_PCT_POINTS
            };
        })
        .sort((a, b) => b.count - a.count);

    return {
        total: rows.length,
        scoredCount: overall.scoredCount,
        excludedCount: rows.length - overall.scoredCount,
        meanScore: overall.meanScore,
        pctPerfect: overall.pctPerfect,
        categories: overall.categories,
        contentIssueCount: overall.contentIssueCount,
        byLanguage,
        evaluators,
        anyEvaluatorFlagged: evaluators.some((e) => e.flagged)
    };
}

// Combined "program — action" label from explicit parts, e.g.
// "Canada child benefit — Change my contact information". Only used to build
// the French label for a stored v1 report's scores-by-service table (pass the
// translated parts); new runs have no such table.
export function combinedLabelFrom(program, action) {
    if (program && action) return `${program} — ${action}`;
    return program || action || OTHER_LABEL;
}
