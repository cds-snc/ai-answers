import dbConnect from '../api/db/db-connect.js';
import { Chat } from '../models/chat.js';
import { EvalAnalysis } from '../models/evalAnalysis.js';
import {
    getChatFilterConditions,
    getPartnerEvalAggregationExpression,
    getAiEvalAggregationExpression
} from '../api/util/chat-filters.js';
import { toCompactRow, computeStats, buildCrossTab } from './evalAnalysisStats.js';
import AgentOrchestratorService from '../agents/AgentOrchestratorService.js';
import { createEvalAnalysisAgent } from '../agents/AgentFactory.js';
import {
    evalAnalysisProgramsStrategy,
    evalAnalysisClassifyStrategy
} from '../agents/strategies/evalAnalysisClassifyStrategy.js';
import { evalAnalysisInsightsStrategy } from '../agents/strategies/evalAnalysisInsightsStrategy.js';
import { PROGRAM_SEEDS_BY_DEPARTMENT, ACTION_SEEDS, OTHER_LABEL } from '../api/data/programActionSeeds.js';
import ServerLoggingService from './ServerLoggingService.js';

// Volume guardrails (also enforced client-side from the precheck endpoint).
// MAX is deliberately low for now — raise once API cost/duration of a full
// run is known.
export const MIN_EVALS = 20;
export const MAX_EVALS = 200;

const CLASSIFY_CHUNK_SIZE = 20;
const PROGRAM_SAMPLE_SIZE = 80;

const parseDateRange = (filters = {}) => {
    const start = filters.startDate ? new Date(filters.startDate) : null;
    const end = filters.endDate ? new Date(filters.endDate) : null;
    const range = {};
    if (start && !Number.isNaN(start.getTime())) range.$gte = start;
    if (end && !Number.isNaN(end.getTime())) range.$lte = end;
    return Object.keys(range).length ? range : null;
};

// Aggregates from Chat and unwinds interactions (same shape as the eval
// dashboard) so shared filters apply with basePath 'interactions' while
// user/chat fields stay on the base document. Human evals only: the filter is
// interactions.expertFeedback — AI auto-evals hang off interactions.autoEval
// and never enter this pipeline.
function buildPipeline(filters = {}, { countOnly = false } = {}) {
    const pipeline = [
        { $project: { chatId: 1, user: 1, pageLanguage: 1, interactions: 1 } },
        { $lookup: { from: 'interactions', localField: 'interactions', foreignField: '_id', as: 'interactions' } },
        { $unwind: { path: '$interactions', preserveNullAndEmptyArrays: false } },
        { $match: { 'interactions.expertFeedback': { $exists: true, $ne: null } } }
    ];

    const dateRange = parseDateRange(filters);
    if (dateRange) pipeline.push({ $match: { 'interactions.createdAt': dateRange } });

    pipeline.push({ $lookup: { from: 'expertfeedbacks', localField: 'interactions.expertFeedback', foreignField: '_id', as: 'expertFeedbackDocs' } });
    pipeline.push({ $addFields: { expertFeedbackDoc: { $arrayElemAt: ['$expertFeedbackDocs', 0] } } });
    // Drop dangling refs whose feedback doc no longer exists.
    pipeline.push({ $match: { expertFeedbackDoc: { $ne: null } } });

    pipeline.push({ $lookup: { from: 'contexts', localField: 'interactions.context', foreignField: '_id', as: 'contextDocs' } });
    pipeline.push({ $addFields: { 'interactions.department': { $ifNull: [{ $arrayElemAt: ['$contextDocs.department', 0] }, ''] } } });

    pipeline.push({ $lookup: { from: 'answers', localField: 'interactions.answer', foreignField: '_id', as: 'answerDocs' } });
    pipeline.push({
        $addFields: {
            'interactions.answerType': { $ifNull: [{ $arrayElemAt: ['$answerDocs.answerType', 0] }, ''] },
            citationId: { $arrayElemAt: ['$answerDocs.citation', 0] }
        }
    });

    // Category fields are only computed when the corresponding filter is set —
    // they exist purely so getChatFilterConditions has something to match.
    if (filters.partnerEval && filters.partnerEval !== 'all') {
        pipeline.push({ $addFields: { 'interactions.partnerEval': getPartnerEvalAggregationExpression('$expertFeedbackDoc') } });
    }
    if (filters.aiEval && filters.aiEval !== 'all') {
        pipeline.push({ $lookup: { from: 'evals', localField: 'interactions.autoEval', foreignField: '_id', as: 'autoEvalDocs' } });
        pipeline.push({ $addFields: { autoEvalExpertId: { $arrayElemAt: ['$autoEvalDocs.expertFeedback', 0] } } });
        pipeline.push({ $lookup: { from: 'expertfeedbacks', localField: 'autoEvalExpertId', foreignField: '_id', as: 'autoEvalFeedbackDocs' } });
        pipeline.push({ $addFields: { autoEvalFeedbackDoc: { $arrayElemAt: ['$autoEvalFeedbackDocs', 0] } } });
        pipeline.push({ $addFields: { 'interactions.aiEval': getAiEvalAggregationExpression('$autoEvalFeedbackDoc') } });
    }

    const shared = getChatFilterConditions(filters, { basePath: 'interactions', userField: 'user' });
    if (shared.length) pipeline.push({ $match: { $and: shared } });

    if (countOnly) {
        pipeline.push({ $count: 'count' });
        return pipeline;
    }

    pipeline.push({ $lookup: { from: 'questions', localField: 'interactions.question', foreignField: '_id', as: 'questionDocs' } });
    pipeline.push({ $lookup: { from: 'citations', localField: 'citationId', foreignField: '_id', as: 'citationDocs' } });
    pipeline.push({
        $project: {
            _id: '$interactions._id',
            chatId: 1,
            pageLanguage: 1,
            createdAt: '$interactions.createdAt',
            referringUrl: '$interactions.referringUrl',
            department: '$interactions.department',
            question: { $ifNull: [{ $arrayElemAt: ['$questionDocs.redactedQuestion', 0] }, ''] },
            citationUrl: {
                $ifNull: [
                    { $arrayElemAt: ['$citationDocs.providedCitationUrl', 0] },
                    { $ifNull: [{ $arrayElemAt: ['$citationDocs.aiCitationUrl', 0] }, ''] }
                ]
            },
            expertFeedback: '$expertFeedbackDoc'
        }
    });
    pipeline.push({ $sort: { createdAt: 1 } });
    // One extra row so the snapshot step can detect a pool that grew past
    // MAX_EVALS after the create-time count, instead of silently truncating.
    pipeline.push({ $limit: MAX_EVALS + 1 });
    return pipeline;
}

const invoke = (strategy, request, chatId) =>
    AgentOrchestratorService.invokeWithStrategy({
        chatId,
        request,
        createAgentFn: (agentType, cid) => createEvalAnalysisAgent(agentType, cid),
        strategy
    });

// Evenly spread sample so the program proposal sees the full date range, not
// just the earliest questions.
const sampleRows = (rows, size) => {
    if (rows.length <= size) return rows;
    const step = rows.length / size;
    return Array.from({ length: size }, (_, i) => rows[Math.floor(i * step)]);
};

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

// The rows snapshot never leaves the server (it repeats question text for up
// to 200 interactions); clients get everything else.
const toClientDoc = (doc) => {
    const obj = doc.toObject ? doc.toObject() : doc;
    const { rows, ...rest } = obj;
    return rest;
};

class EvalAnalysisServiceClass {
    async countEvals(filters = {}) {
        await dbConnect();
        const result = await Chat.aggregate(buildPipeline(filters, { countOnly: true }));
        return result.length ? result[0].count : 0;
    }

    // Creates the analysis doc after re-validating the volume gates. The
    // heavy work happens in advance() calls driven by the client.
    async createAnalysis({ filters = {}, language = 'en', requestedBy = '' }) {
        if (!filters.department) {
            const err = new Error('An institution (department) filter is required');
            err.code = 'departmentRequired';
            throw err;
        }
        const count = await this.countEvals(filters);
        if (count < MIN_EVALS) {
            const err = new Error(`Too few evaluations to analyze (${count} < ${MIN_EVALS})`);
            err.code = 'tooFew';
            err.count = count;
            throw err;
        }
        if (count > MAX_EVALS) {
            const err = new Error(`Too many evaluations for one analysis (${count} > ${MAX_EVALS})`);
            err.code = 'tooMany';
            err.count = count;
            throw err;
        }
        const doc = await EvalAnalysis.create({
            department: filters.department,
            startDate: filters.startDate ? new Date(filters.startDate) : null,
            endDate: filters.endDate ? new Date(filters.endDate) : null,
            filters,
            language: language === 'fr' ? 'fr' : 'en',
            status: 'running',
            requestedBy
        });
        return toClientDoc(doc);
    }

    // Advances a run by exactly one step (snapshot+programs, one classification
    // chunk, or synthesis) so each HTTP request stays short. Any step failure
    // marks the doc 'error' but keeps whatever was already computed.
    // The rows snapshot is deliberately NOT loaded here — each step fetches
    // only the slice it needs and writes row changes as targeted $set deltas,
    // so a 200-row run doesn't re-read/rewrite the whole array every step.
    async advance(analysisId) {
        await dbConnect();
        const doc = await EvalAnalysis.findById(analysisId).select('-rows');
        if (!doc) {
            const err = new Error('Analysis not found');
            err.code = 'notFound';
            throw err;
        }
        if (doc.status === 'complete' || doc.status === 'error') return toClientDoc(doc);

        try {
            if (doc.status === 'running') {
                await this.#snapshotAndProposePrograms(doc);
            } else if (doc.status === 'classifying') {
                await this.#classifyNextChunk(doc);
            } else if (doc.status === 'synthesizing') {
                await this.#synthesize(doc);
            }
        } catch (err) {
            ServerLoggingService.error('Eval analysis step failed', String(doc._id), err);
            doc.status = 'error';
            doc.error = err?.message || 'Analysis step failed';
            await EvalAnalysis.updateOne(
                { _id: doc._id },
                { $set: { status: doc.status, error: doc.error } }
            );
        }
        return toClientDoc(doc);
    }

    async getAnalysis(analysisId) {
        await dbConnect();
        const doc = await EvalAnalysis.findById(analysisId).lean();
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

    async #snapshotAndProposePrograms(doc) {
        const aggRows = await Chat.aggregate(buildPipeline(doc.filters || {}));
        const rows = aggRows.map(toCompactRow);
        if (rows.length < MIN_EVALS) {
            const err = new Error(`Too few evaluations to analyze (${rows.length} < ${MIN_EVALS})`);
            err.code = 'tooFew';
            throw err;
        }
        // The pool can grow between the create-time count and this snapshot;
        // the pipeline fetches MAX+1 so overflow is detectable — fail rather
        // than silently analyze a truncated population.
        if (rows.length > MAX_EVALS) {
            const err = new Error(`Too many evaluations for one analysis (more than ${MAX_EVALS} now match)`);
            err.code = 'tooMany';
            throw err;
        }
        const stats = computeStats(rows);

        const chatId = `eval-analysis-${doc._id}`;
        const proposal = await invoke(
            evalAnalysisProgramsStrategy,
            {
                department: doc.department,
                seedPrograms: PROGRAM_SEEDS_BY_DEPARTMENT[doc.department] || [],
                sampleRows: sampleRows(rows, PROGRAM_SAMPLE_SIZE)
            },
            chatId
        );
        if (!proposal?.programs?.length) {
            throw new Error('Program proposal did not return a usable program list');
        }

        const scalars = {
            stats,
            programs: proposal.programs,
            evalCount: rows.length,
            excludedCount: stats.excludedCount,
            progress: { classified: 0, total: rows.length },
            status: 'classifying'
        };
        // updateOne (not doc.save) because `doc` was loaded without the rows
        // path and this is the one step that writes the whole snapshot.
        await EvalAnalysis.updateOne({ _id: doc._id }, { $set: { ...scalars, rows } });
        Object.assign(doc, scalars);
    }

    async #classifyNextChunk(doc) {
        const offset = doc.progress?.classified || 0;
        const total = doc.progress?.total || 0;

        // Fetch only this step's chunk — not the whole snapshot.
        let chunk = [];
        if (offset < total) {
            const chunkDoc = await EvalAnalysis.findById(doc._id)
                .select({ _id: 1, rows: { $slice: [offset, CLASSIFY_CHUNK_SIZE] } })
                .lean();
            chunk = chunkDoc?.rows || [];
        }

        // Row tag updates as targeted dotted-path $set deltas (rows.<i>.program)
        // so only the ~20 changed rows are written, not the whole Mixed array.
        const rowSets = {};
        if (chunk.length > 0) {
            const chatId = `eval-analysis-${doc._id}`;
            const request = { programs: doc.programs, actions: ACTION_SEEDS, rows: chunk };
            let assignments = null;
            try {
                assignments = (await invoke(evalAnalysisClassifyStrategy, request, chatId))?.assignments;
            } catch (e) {
                ServerLoggingService.warn('Eval analysis classify chunk failed, retrying once', String(doc._id), e);
            }
            if (!assignments) {
                // The retry must not throw: a twice-failed chunk stays
                // unclassified (program null) and the run continues — the report
                // states how many rows were unclassified.
                try {
                    assignments = (await invoke(evalAnalysisClassifyStrategy, request, chatId))?.assignments;
                } catch (e) {
                    ServerLoggingService.warn('Eval analysis classify retry failed; leaving chunk unclassified', String(doc._id), e);
                }
            }
            if (assignments) {
                const validPrograms = new Set([...doc.programs, OTHER_LABEL]);
                const validActions = new Set([...ACTION_SEEDS.map((a) => a.action), OTHER_LABEL]);
                const byId = new Map(assignments.map((a) => [a.id, a]));
                chunk.forEach((row, i) => {
                    const a = byId.get(row.id);
                    if (!a) return;
                    rowSets[`rows.${offset + i}.program`] = validPrograms.has(a.program) ? a.program : OTHER_LABEL;
                    rowSets[`rows.${offset + i}.action`] = validActions.has(a.action) ? a.action : OTHER_LABEL;
                });
            }
        }

        const progress = { classified: Math.min(offset + CLASSIFY_CHUNK_SIZE, total), total };
        const status = progress.classified >= total ? 'synthesizing' : doc.status;
        await EvalAnalysis.updateOne({ _id: doc._id }, { $set: { ...rowSets, progress, status } });
        doc.progress = progress;
        doc.status = status;
    }

    async #synthesize(doc) {
        // This is the one step that genuinely needs the full snapshot.
        const rowsDoc = await EvalAnalysis.findById(doc._id).select({ _id: 1, rows: 1 }).lean();
        const rows = rowsDoc?.rows || [];

        // Persist the cross-tab before the LLM call so a synthesis failure
        // still leaves the classification results viewable.
        const crossTab = buildCrossTab(rows);
        await EvalAnalysis.updateOne({ _id: doc._id }, { $set: { crossTab } });
        doc.crossTab = crossTab;

        const nonPerfect = rows.filter(
            (r) => (r.score !== null && r.score < 100) || (r.category && r.category !== 'correct')
        );
        // A theme must recur to count as analysis: at least 2 rows, scaling to
        // 20% of the non-perfect pool on bigger runs. Asked of the model AND
        // enforced on its output — a single-example "theme" is an anecdote.
        const minThemeCount = Math.max(2, Math.ceil(nonPerfect.length * 0.2));
        const result = await invoke(
            evalAnalysisInsightsStrategy,
            {
                language: doc.language,
                department: doc.department,
                dateRange: { start: doc.startDate, end: doc.endDate },
                stats: doc.stats,
                crossTab,
                minThemeCount,
                lowScoreRows: nonPerfect.map(slimRowForInsights),
                contentIssueRows: rows.filter((r) => r.contentIssue).map(slimRowForInsights)
            },
            `eval-analysis-${doc._id}`
        );
        if (!result?.insights) {
            throw new Error('Insight synthesis did not return a usable result');
        }
        const insights = {
            ...result.insights,
            explanationThemes: Array.isArray(result.insights.explanationThemes)
                ? result.insights.explanationThemes.filter(
                      (th) => typeof th?.count === 'number' && th.count >= minThemeCount
                  )
                : []
        };
        await EvalAnalysis.updateOne({ _id: doc._id }, { $set: { insights, status: 'complete' } });
        doc.insights = insights;
        doc.status = 'complete';
    }
}

const EvalAnalysisService = new EvalAnalysisServiceClass();
export default EvalAnalysisService;
