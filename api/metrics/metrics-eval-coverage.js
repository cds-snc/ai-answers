import dbConnect from '../db/db-connect.js';
import { Chat } from '../../models/chat.js';
import { Interaction } from '../../models/interaction.js';
import { authMiddleware, partnerOrAdminMiddleware, withProtection } from '../../middleware/auth.js';
import { getPartnerEvalAggregationExpression, getEvalInformedAggregationExpression } from '../util/chat-filters.js';
import { frForProgram, frForAction } from '../util/programActionFr.js';
import { OTHER_LABEL } from '../data/programActionSeeds.js';
import { EVAL_INFORMED_WORKFLOW, EVAL_INFORMED_RECENCY_DAYS } from '../../src/config/workflows.js';
import { parseRequestFilters, executeWithRetry } from './metrics-common.js';
import { buildProgramScopeStages } from './metrics-programs.js';

// Same cap as the question-volume chart (metrics-programs.js).
const MAX_PROGRAMS = 25;

// An evaluation counts as "expiring" when it will pass the recency limit
// within this many days.
export const EXPIRING_WINDOW_DAYS = 60;

const DAY_MS = 24 * 60 * 60 * 1000;

// Evaluation coverage by program, for the partner dashboard. Two queries:
//
// 1. buildEvalCoveragePipeline — the questions in the date range, same scope
//    as the question-volume chart (normal answers, all applied filters). Per
//    program: questions, human evaluations, how many scored below perfect,
//    answers that were given past evaluations (same definition as the
//    eval-informed rate in metrics-usage.js), and the actions asked about.
//
// 2. buildUsableEvalsPipeline — what eval-informed answering can draw on
//    today. Not limited by the date range or the other filters, because
//    retrieval isn't: it uses any human evaluation of the department's
//    questions from the last EVAL_INFORMED_RECENCY_DAYS (or flagged
//    neverStale), whenever the question was asked. Scoped by department and
//    program only. Per program: usable evaluations, and how many stop being
//    usable within EXPIRING_WINDOW_DAYS.
//
// TODO: split the counts EN/FR. Retrieval matches same language only, so
// combined coverage overstates it for the less-evaluated language — see
// docs/plans/partner-eval-analysis.md ("split coverage EN/FR").
export function buildEvalCoveragePipeline({ dateFilter, extraFilterConditions, departmentFilter, answerTypeFilter, partnerEvalFilter, aiEvalFilter }) {
    const stages = buildProgramScopeStages(
        dateFilter, extraFilterConditions, departmentFilter, answerTypeFilter, partnerEvalFilter, aiEvalFilter,
        {
            action: { $ifNull: [{ $arrayElemAt: ['$ctx.action', 0] }, ''] },
            // Reduced to a boolean here so the question/answer text inside
            // qaMatches never travels further down the pipeline.
            evalInformed: {
                $and: [
                    { $eq: ['$interactions.workflow', EVAL_INFORMED_WORKFLOW] },
                    getEvalInformedAggregationExpression({ $arrayElemAt: ['$ctx.qaMatches', 0] })
                ]
            }
        }
    );

    stages.push(
        { $lookup: { from: 'expertfeedbacks', localField: 'expertFeedbackId', foreignField: '_id', as: 'efDocs' } },
        { $addFields: { ef: { $arrayElemAt: ['$efDocs', 0] } } },
        {
            $addFields: {
                // Human = feedback present and not AI-typed. interaction.expertFeedback
                // only ever holds human feedback today; the type check keeps an
                // AI-typed doc out of the count if that ever changes.
                isHuman: {
                    $and: [
                        { $ne: [{ $ifNull: ['$ef', null] }, null] },
                        { $ne: ['$ef.type', 'ai'] }
                    ]
                },
                category: getPartnerEvalAggregationExpression('$ef'),
                // '' (never classified), 'unknown' (not confident) and 'Other'
                // say nothing about what was asked, so they're left out of the list.
                action: {
                    $cond: [{ $in: ['$action', ['', 'unknown', OTHER_LABEL]] }, null, '$action']
                }
            }
        },
        {
            $project: {
                program: 1,
                action: 1,
                evalInformed: 1,
                isHuman: 1,
                isScored: { $and: ['$isHuman', { $ne: ['$category', null] }] },
                isNonPerfect: { $and: ['$isHuman', { $ne: ['$category', null] }, { $ne: ['$category', 'correct'] }] }
            }
        },
        // Two-stage group: per program+action first (so actions can be ranked),
        // then per program. Smaller groups keep it DocumentDB-friendly.
        {
            $group: {
                _id: { program: '$program', action: '$action' },
                questions: { $sum: 1 },
                humanEvals: { $sum: { $cond: ['$isHuman', 1, 0] } },
                scoredEvals: { $sum: { $cond: ['$isScored', 1, 0] } },
                nonPerfectEvals: { $sum: { $cond: ['$isNonPerfect', 1, 0] } },
                informedAnswers: { $sum: { $cond: ['$evalInformed', 1, 0] } }
            }
        },
        {
            $group: {
                _id: '$_id.program',
                questions: { $sum: '$questions' },
                humanEvals: { $sum: '$humanEvals' },
                scoredEvals: { $sum: '$scoredEvals' },
                nonPerfectEvals: { $sum: '$nonPerfectEvals' },
                informedAnswers: { $sum: '$informedAnswers' },
                actions: { $push: { action: '$_id.action', count: '$questions' } }
            }
        },
        { $sort: { questions: -1, _id: 1 } },
        { $limit: MAX_PROGRAMS }
    );
    return stages;
}

// Mirrors the conditions QuestionAnswerService and the vector services apply
// before an evaluation can be injected: human (not type 'ai'), has a total
// score (retrieval filters totalScore <= 100, so a missing one never
// matches — the expert form always sets one, so this only guards bad or
// legacy data), and evaluated within the recency limit or flagged neverStale
// (boolean or the string 'true', as QuestionAnswerService accepts). Not
// mirrored: whether the embedding has synced — counted as usable regardless.
// Starts from interactions with feedback (indexed), so the work is bounded by
// the number of human evaluations, not the number of questions.
export function buildUsableEvalsPipeline(departmentFilter = [], now = Date.now()) {
    const usableSince = new Date(now - EVAL_INFORMED_RECENCY_DAYS * DAY_MS);
    const expiringBefore = new Date(now - (EVAL_INFORMED_RECENCY_DAYS - EXPIRING_WINDOW_DAYS) * DAY_MS);
    return [
        { $match: { expertFeedback: { $exists: true, $ne: null } } },
        { $project: { expertFeedback: 1, context: 1 } },
        { $lookup: { from: 'expertfeedbacks', localField: 'expertFeedback', foreignField: '_id', as: 'efDocs' } },
        { $addFields: { ef: { $arrayElemAt: ['$efDocs', 0] } } },
        {
            $match: {
                'ef.type': { $ne: 'ai' },
                'ef.totalScore': { $ne: null },
                $or: [
                    { 'ef.neverStale': { $in: [true, 'true'] } },
                    { 'ef.createdAt': { $gte: usableSince } }
                ]
            }
        },
        { $lookup: { from: 'contexts', localField: 'context', foreignField: '_id', as: 'ctx' } },
        {
            $project: {
                department: { $ifNull: [{ $arrayElemAt: ['$ctx.department', 0] }, ''] },
                program: { $ifNull: [{ $arrayElemAt: ['$ctx.program', 0] }, ''] },
                isExpiring: {
                    $and: [
                        { $not: [{ $in: ['$ef.neverStale', [true, 'true']] }] },
                        { $lt: ['$ef.createdAt', expiringBefore] }
                    ]
                }
            }
        },
        // Same department match as the questions query (parseRequestFilters).
        ...(departmentFilter.length > 0 ? [{ $match: { $and: departmentFilter } }] : []),
        { $match: { program: { $nin: ['', 'unknown'] } } },
        {
            $group: {
                _id: '$program',
                usableEvals: { $sum: 1 },
                expiringEvals: { $sum: { $cond: ['$isExpiring', 1, 0] } }
            }
        }
    ];
}

// Stored names are canonical English; the curated French name rides along
// (empty when there is none — the client then shows the English name, tagged
// lang="en").
// `usable` is the program's row from buildUsableEvalsPipeline. The
// unclassified row gets null: its evaluations can't be traced to a service.
export function toCoverageRow(row, usable) {
    const actions = (row.actions || [])
        .filter((a) => a.action)
        .sort((a, b) => b.count - a.count || a.action.localeCompare(b.action))
        .map((a) => ({ action: a.action, actionFr: frForAction(a.action), count: a.count }));
    return {
        program: row._id,
        programFr: row._id === 'unknown' ? '' : frForProgram(row._id),
        questions: row.questions || 0,
        humanEvals: row.humanEvals || 0,
        scoredEvals: row.scoredEvals || 0,
        nonPerfectEvals: row.nonPerfectEvals || 0,
        usableEvals: row._id === 'unknown' ? null : (usable?.usableEvals || 0),
        expiringEvals: row._id === 'unknown' ? null : (usable?.expiringEvals || 0),
        informedAnswers: row.informedAnswers || 0,
        actions
    };
}

async function getEvalCoverageMetrics(req, res) {
    if (req.method !== 'GET') return res.status(405).json({ message: 'Method not allowed' });
    try {
        await dbConnect();
        const filters = await parseRequestFilters(req);
        if (!filters.dateFilter.createdAt) return res.status(400).json({ error: 'Invalid date range' });

        const [result, usableRows] = await Promise.all([
            executeWithRetry(() => Chat.aggregate(buildEvalCoveragePipeline(filters)).allowDiskUse(true)),
            executeWithRetry(() => Interaction.aggregate(buildUsableEvalsPipeline(filters.departmentFilter)).allowDiskUse(true))
        ]);
        const usableByProgram = new Map(usableRows.map((r) => [r._id, r]));

        return res.status(200).json({
            success: true,
            metrics: {
                evalCoverage: {
                    programs: result.map((row) => toCoverageRow(row, usableByProgram.get(row._id))),
                    recencyDays: EVAL_INFORMED_RECENCY_DAYS,
                    expiringWindowDays: EXPIRING_WINDOW_DAYS
                }
            }
        });
    } catch (error) {
        console.error('Error in eval coverage metrics:', error);
        return res.status(500).json({ error: 'Failed to fetch evaluation coverage metrics' });
    }
}

export default withProtection(getEvalCoverageMetrics, authMiddleware, partnerOrAdminMiddleware);
