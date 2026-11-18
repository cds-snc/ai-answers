import mongoose from 'mongoose';
import dbConnect from '../api/db/db-connect.js';
import { resolveReviewerMatch } from '../api/util/reviewer-filter.js';
import { Chat } from '../models/chat.js';
import { Interaction } from '../models/interaction.js';
import { EvalAnalysis } from '../models/evalAnalysis.js';
import {
    getChatFilterConditions,
    getPartnerEvalAggregationExpression,
    getAiEvalAggregationExpression,
    getHasCitationErrorAggregationExpression
} from '../api/util/chat-filters.js';
import {
    toCompactRow,
    computeStats,
    combinedLabelFrom,
    selectInsightRows,
    withQuestionDetails,
    MAX_INSIGHT_ROWS
} from './evalAnalysisStats.js';
import { frForProgram, frForAction } from '../api/util/programActionFr.js';
import AgentOrchestratorService from '../agents/AgentOrchestratorService.js';
import { createEvalAnalysisAgent } from '../agents/AgentFactory.js';
import { evalAnalysisInsightsStrategy } from '../agents/strategies/evalAnalysisInsightsStrategy.js';
import ServerLoggingService from './ServerLoggingService.js';

const CHAT_LOOKBACK_MS = 24 * 60 * 60 * 1000;

const parseDateRange = (filters = {}) => {
    const start = filters.startDate ? new Date(filters.startDate) : null;
    const end = filters.endDate ? new Date(filters.endDate) : null;
    const range = {};
    if (start && !Number.isNaN(start.getTime())) range.$gte = start;
    if (end && !Number.isNaN(end.getTime())) range.$lte = end;
    return Object.keys(range).length ? range : null;
};

// Every human expert evaluation in scope, without question or citation text
// (those are fetched only for the rows sent to the insights call, see
// fetchQuestionDetails). There is no volume limit: the stats cover every
// evaluation, and only the model's input is capped (MAX_INSIGHT_ROWS).
//
// Aggregates from Chat and unwinds interactions (same shape as the eval
// dashboard) so shared filters apply with basePath 'interactions' while
// user/chat fields stay on the base document. Human evals only: the filter is
// interactions.expertFeedback — AI auto-evals hang off interactions.autoEval
// and never enter this pipeline.
async function buildPipeline(filters = {}) {
    const dateRange = parseDateRange(filters);
    // Narrow by the chat's date first, on the indexed field, so only chats
    // near the range go through the interactions lookup. The lower bound is
    // one day early so a chat that started just before the range still
    // contributes its in-range interactions; the exact range is applied to
    // interactions.createdAt below.
    const chatRange = dateRange ? { ...dateRange } : null;
    if (chatRange?.$gte) chatRange.$gte = new Date(chatRange.$gte.getTime() - CHAT_LOOKBACK_MS);
    const pipeline = [
        ...(chatRange ? [{ $match: { createdAt: chatRange } }] : []),
        { $project: { chatId: 1, user: 1, pageLanguage: 1, interactions: 1 } },
        { $lookup: { from: 'interactions', localField: 'interactions', foreignField: '_id', as: 'interactions' } },
        { $unwind: { path: '$interactions', preserveNullAndEmptyArrays: false } },
        { $match: { 'interactions.expertFeedback': { $exists: true, $ne: null } } }
    ];

    if (dateRange) pipeline.push({ $match: { 'interactions.createdAt': dateRange } });

    pipeline.push({ $lookup: { from: 'expertfeedbacks', localField: 'interactions.expertFeedback', foreignField: '_id', as: 'expertFeedbackDocs' } });
    pipeline.push({ $addFields: { expertFeedbackDoc: { $arrayElemAt: ['$expertFeedbackDocs', 0] } } });
    // Drop dangling refs whose feedback doc no longer exists.
    pipeline.push({ $match: { expertFeedbackDoc: { $ne: null } } });

    pipeline.push({ $lookup: { from: 'contexts', localField: 'interactions.context', foreignField: '_id', as: 'contextDocs' } });
    // department drives filtering; program/action are the per-question
    // classifier's stored tags.
    pipeline.push({
        $addFields: {
            'interactions.department': { $ifNull: [{ $arrayElemAt: ['$contextDocs.department', 0] }, ''] },
            'interactions.program': { $ifNull: [{ $arrayElemAt: ['$contextDocs.program', 0] }, ''] },
            'interactions.action': { $ifNull: [{ $arrayElemAt: ['$contextDocs.action', 0] }, ''] }
        }
    });

    // Answer type for the answerType filter.
    pipeline.push({ $lookup: { from: 'answers', localField: 'interactions.answer', foreignField: '_id', as: 'answerDocs' } });
    pipeline.push({
        $addFields: {
            'interactions.answerType': { $ifNull: [{ $arrayElemAt: ['$answerDocs.answerType', 0] }, ''] }
        }
    });

    // Category fields are only computed when the corresponding filter is set —
    // they exist purely so getChatFilterConditions has something to match.
    if (filters.partnerEval && filters.partnerEval !== 'all') {
        pipeline.push({
            $addFields: {
                'interactions.partnerEval': getPartnerEvalAggregationExpression('$expertFeedbackDoc'),
                'interactions.partnerHasCitationError': getHasCitationErrorAggregationExpression('$expertFeedbackDoc')
            }
        });
    }
    if (filters.aiEval && filters.aiEval !== 'all') {
        pipeline.push({ $lookup: { from: 'evals', localField: 'interactions.autoEval', foreignField: '_id', as: 'autoEvalDocs' } });
        pipeline.push({ $addFields: { autoEvalExpertId: { $arrayElemAt: ['$autoEvalDocs.expertFeedback', 0] } } });
        pipeline.push({ $lookup: { from: 'expertfeedbacks', localField: 'autoEvalExpertId', foreignField: '_id', as: 'autoEvalFeedbackDocs' } });
        pipeline.push({ $addFields: { autoEvalFeedbackDoc: { $arrayElemAt: ['$autoEvalFeedbackDocs', 0] } } });
        pipeline.push({
            $addFields: {
                'interactions.aiEval': getAiEvalAggregationExpression('$autoEvalFeedbackDoc'),
                'interactions.aiHasCitationError': getHasCitationErrorAggregationExpression('$autoEvalFeedbackDoc')
            }
        });
    }

    const reviewerMatch = await resolveReviewerMatch(filters);
    const shared = getChatFilterConditions({ ...filters, reviewerMatch }, { basePath: 'interactions', userField: 'user' });
    if (shared.length) pipeline.push({ $match: { $and: shared } });

    pipeline.push({
        $project: {
            _id: '$interactions._id',
            chatId: 1,
            pageLanguage: 1,
            createdAt: '$interactions.createdAt',
            referringUrl: '$interactions.referringUrl',
            department: '$interactions.department',
            program: '$interactions.program',
            action: '$interactions.action',
            expertFeedback: '$expertFeedbackDoc'
        }
    });
    return pipeline;
}

// Question and citation text for the rows sent to the insights call, by
// interaction id. Bounded by MAX_INSIGHT_ROWS per list.
async function fetchQuestionDetails(rowIds) {
    if (rowIds.length === 0) return new Map();
    const ids = rowIds.map((id) => new mongoose.Types.ObjectId(id));
    const docs = await Interaction.aggregate([
        { $match: { _id: { $in: ids } } },
        { $project: { question: 1, answer: 1 } },
        { $lookup: { from: 'questions', localField: 'question', foreignField: '_id', as: 'questionDocs' } },
        { $lookup: { from: 'answers', localField: 'answer', foreignField: '_id', as: 'answerDocs' } },
        { $addFields: { citationId: { $arrayElemAt: ['$answerDocs.citation', 0] } } },
        { $lookup: { from: 'citations', localField: 'citationId', foreignField: '_id', as: 'citationDocs' } },
        {
            $project: {
                question: { $ifNull: [{ $arrayElemAt: ['$questionDocs.redactedQuestion', 0] }, ''] },
                citationUrl: {
                    $ifNull: [
                        { $arrayElemAt: ['$citationDocs.providedCitationUrl', 0] },
                        { $ifNull: [{ $arrayElemAt: ['$citationDocs.aiCitationUrl', 0] }, ''] }
                    ]
                }
            }
        }
    ]);
    return new Map(docs.map((d) => [String(d._id), d]));
}

const invoke = (strategy, request, chatId) =>
    AgentOrchestratorService.invokeWithStrategy({
        chatId,
        request,
        createAgentFn: (agentType, cid) => createEvalAnalysisAgent(agentType, cid),
        strategy
    });

const slimRowForInsights = (r) => ({
    q: r.q,
    lang: r.lang,
    score: r.score,
    category: r.category,
    contentIssue: r.contentIssue,
    expl: r.expl,
    citeExpl: r.citeExpl,
    improve: r.improve,
    program: r.program,
    action: r.action
});

// French display label for a cross-tab group, built from the stored English
// program/action parts (display-only; English stays canonical). Only v1
// reports store a cross-tab; reports saved before the parts were stored keep
// only the English label.
const withCrossTabFr = (crossTab) => {
    if (!crossTab || !Array.isArray(crossTab.groups)) return crossTab;
    return {
        ...crossTab,
        groups: crossTab.groups.map((g) =>
            g.program || g.action
                ? { ...g, labelFr: combinedLabelFrom(
                      g.program ? (frForProgram(g.program) || g.program) : null,
                      g.action ? (frForAction(g.action) || g.action) : null
                  ) }
                : g
        )
    };
};

// v1 reports stored a rows snapshot (question text for up to 200
// interactions). It never leaves the server.
const toClientDoc = (doc) => {
    const obj = doc.toObject ? doc.toObject() : doc;
    const { rows, ...rest } = obj;
    if (rest.crossTab) rest.crossTab = withCrossTabFr(rest.crossTab);
    return rest;
};

class EvalAnalysisServiceClass {
    // Runs the whole analysis in one request: stats over every evaluation in
    // scope, then one insights call. The doc is created first (status
    // 'running') so a request that dies mid-way still shows in the past-runs
    // list as interrupted. A failed insights call stores status 'error' with
    // the stats kept, and is returned rather than thrown.
    async createAndSynthesize({ filters = {}, language = 'en', requestedBy = '' }) {
        if (!filters.department) {
            const err = new Error('An institution (department) filter is required');
            err.code = 'departmentRequired';
            throw err;
        }
        await dbConnect();
        const doc = await EvalAnalysis.create({
            department: filters.department,
            startDate: filters.startDate ? new Date(filters.startDate) : null,
            endDate: filters.endDate ? new Date(filters.endDate) : null,
            filters,
            language: language === 'fr' ? 'fr' : 'en',
            status: 'running',
            requestedBy
        });

        try {
            const rows = (await Chat.aggregate(await buildPipeline(filters)).allowDiskUse(true)).map(toCompactRow);
            const stats = computeStats(rows);
            const selected = selectInsightRows(rows, MAX_INSIGHT_ROWS);
            doc.stats = stats;
            doc.evalCount = rows.length;
            doc.excludedCount = stats.excludedCount;
            doc.insightInput = {
                nonPerfectTotal: selected.nonPerfectTotal,
                nonPerfectSent: selected.lowScoreRows.length,
                contentIssueTotal: selected.contentIssueTotal,
                contentIssueSent: selected.contentIssueRows.length
            };
            // Save the stats before the LLM call so a failed call still
            // leaves them viewable.
            await doc.save();

            doc.insights = await this.#synthesize(doc, selected);
            doc.status = 'complete';
            await doc.save();
        } catch (err) {
            ServerLoggingService.error('Eval analysis failed', String(doc._id), err);
            doc.status = 'error';
            doc.error = err?.message || 'Analysis failed';
            await EvalAnalysis.updateOne({ _id: doc._id }, { $set: { status: doc.status, error: doc.error } });
        }
        return toClientDoc(doc);
    }

    async getAnalysis(analysisId) {
        await dbConnect();
        const doc = await EvalAnalysis.findById(analysisId).select('-rows').lean();
        if (!doc) {
            const err = new Error('Analysis not found');
            err.code = 'notFound';
            throw err;
        }
        return toClientDoc(doc);
    }

    async listAnalyses(department, limit = 20) {
        await dbConnect();
        return EvalAnalysis.find({ department })
            .sort({ createdAt: -1 })
            .limit(limit)
            .select('department startDate endDate language status evalCount requestedBy error createdAt')
            .lean();
    }

    // One insights call over the selected rows. Nothing to analyze (no
    // non-perfect or content-issue rows) → no call.
    async #synthesize(doc, { lowScoreRows, contentIssueRows }) {
        if (lowScoreRows.length === 0 && contentIssueRows.length === 0) {
            return { explanationThemes: [], contentIssues: '' };
        }
        const details = await fetchQuestionDetails(
            Array.from(new Set([...lowScoreRows, ...contentIssueRows].map((r) => r.id)))
        );
        const enrich = (r) => slimRowForInsights(withQuestionDetails(r, details.get(r.id)));

        // A theme must recur to count as analysis: at least 2 rows, scaling to
        // 20% of the non-perfect rows the model sees. Asked of the model AND
        // enforced on its output — a single-example "theme" is an anecdote.
        const minThemeCount = Math.max(2, Math.ceil(lowScoreRows.length * 0.2));
        const result = await invoke(
            evalAnalysisInsightsStrategy,
            {
                language: doc.language,
                department: doc.department,
                dateRange: { start: doc.startDate, end: doc.endDate },
                stats: doc.stats,
                minThemeCount,
                lowScoreRows: lowScoreRows.map(enrich),
                contentIssueRows: contentIssueRows.map(enrich)
            },
            `eval-analysis-${doc._id}`
        );
        if (!result?.insights) {
            throw new Error('Insight synthesis did not return a usable result');
        }
        return {
            ...result.insights,
            explanationThemes: Array.isArray(result.insights.explanationThemes)
                ? result.insights.explanationThemes.filter(
                      (th) => typeof th?.count === 'number' && th.count >= minThemeCount
                  )
                : []
        };
    }
}

const EvalAnalysisService = new EvalAnalysisServiceClass();
export default EvalAnalysisService;
