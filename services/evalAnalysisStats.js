// Pure Tier 1 helpers for the partner eval analysis. No DB or React — keep
// this module import-safe from tests and from EvalAnalysisService.
//
// Category semantics come from deriveExpertFeedbackCategory in
// api/util/chat-filters.js — the JS mirror of the aggregation expression the
// dashboards use, kept beside it so the analysis can't drift from them.

import { deriveExpertFeedbackCategory } from '../api/util/chat-filters.js';
import { OTHER_LABEL } from '../api/data/programActionSeeds.js';

const SENTENCE_NUMBERS = [1, 2, 3, 4];

// An evaluator's perfect-rate must differ from the rest of the group by more
// than this many percentage points (with at least MIN_EVALS_FOR_FLAG evals)
// to be flagged as an anomaly. Deliberately plain — with 20-200 evals,
// heavier statistics would overpromise.
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

// Compact snapshot row stored on the EvalAnalysis doc. Text fields are
// truncated so 200 rows stay comfortably small; the ids allow drilling back
// to the full interaction later if needed.
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
        program: null,
        action: null
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

// A group needs at least this many evaluations to appear in the cross-tab:
// one evaluation is an anecdote, not a pattern. Smaller groups are dropped
// from the table and reported in aggregate (skippedSingles).
export const MIN_GROUP_COUNT = 2;

// Combined "program — action" group label, e.g.
// "Canada child benefit — Change my contact information". An uninformative
// half (missing or "Other") is left off rather than shown as "— Other".
export function combinedLabel(row) {
    const program = row.program && row.program !== OTHER_LABEL ? row.program : null;
    const action = row.action && row.action !== OTHER_LABEL ? row.action : null;
    if (program && action) return `${program} — ${action}`;
    return program || action || OTHER_LABEL;
}

// Tier 2 cross-tab: score categories per combined program—action group, built
// after classification has tagged the rows. Groups sorted by non-perfect
// rate (descending), always-perfect groups flagged.
export function buildCrossTab(rows) {
    const byLabel = new Map();
    rows.forEach((r) => {
        if (!r.program) return; // unclassified rows are counted separately
        const key = combinedLabel(r);
        if (!byLabel.has(key)) byLabel.set(key, []);
        byLabel.get(key).push(r);
    });

    const all = Array.from(byLabel.entries()).map(([label, groupRows]) => {
        const summary = summarizeGroup(groupRows);
        // One clickable example per group so evaluators can open a real
        // conversation from the report: prefer a non-perfect row (that's the
        // one worth inspecting), else the group's first row.
        const exampleRow =
            groupRows.find((r) => (r.score !== null && r.score < 100) || (r.category && r.category !== 'correct')) ||
            groupRows[0];
        return {
            label,
            example: { chatId: exampleRow.chatId, interactionId: exampleRow.id, lang: exampleRow.lang },
            count: summary.count,
            scoredCount: summary.scoredCount,
            nonPerfectCount: summary.scoredCount - summary.perfectCount,
            pctNonPerfect: summary.pctPerfect !== null ? 100 - summary.pctPerfect : null,
            categories: summary.categories,
            contentIssueCount: summary.contentIssueCount,
            alwaysPerfect: summary.scoredCount > 0 && summary.pctPerfect === 100
        };
    });

    const groups = all
        .filter((g) => g.count >= MIN_GROUP_COUNT)
        .sort((a, b) => (b.pctNonPerfect ?? -1) - (a.pctNonPerfect ?? -1) || b.count - a.count);
    const skipped = all.filter((g) => g.count < MIN_GROUP_COUNT);

    return {
        groups,
        skippedSingles: {
            groupCount: skipped.length,
            rowCount: skipped.reduce((sum, g) => sum + g.count, 0)
        },
        unclassifiedCount: rows.filter((r) => !r.program).length
    };
}
