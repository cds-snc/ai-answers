import dbConnect from '../db/db-connect.js';
import { Chat } from '../../models/chat.js';
import { withProtection } from '../../middleware/auth.js';
import { getPartnerEvalAggregationExpression, getAiEvalAggregationExpression } from '../util/chat-filters.js';
import { parseRequestFilters, executeWithRetry } from './metrics-common.js';

function getBasePipelineStages(dateFilter, extraFilters = [], departmentFilter = []) {
    const stages = [
        { $match: dateFilter },
        // Lookup interactions
        {
            $lookup: {
                from: 'interactions',
                localField: 'interactions',
                foreignField: '_id',
                as: 'interactions'
            }
        },
        { $unwind: '$interactions' },
        // Apply extra filters after unwind (since they likely filter on interactions.x)
        ...(extraFilters.length > 0 ? [{ $match: { $and: extraFilters } }] : []),
        // Lookup context (minimal fields needed)
        {
            $lookup: {
                from: 'contexts',
                localField: 'interactions.context',
                foreignField: '_id',
                as: 'ctx'
            }
        },
        {
            $addFields: {
                'interactions.context': { $arrayElemAt: ['$ctx', 0] }
            }
        },
        // Project early to reduce memory - only fields needed for metrics
        {
            $project: {
                chatId: 1,
                searchProvider: 1,
                pageLanguage: 1,
                department: { $arrayElemAt: ['$ctx.department', 0] },
                contextInputTokens: { $convert: { input: '$interactions.context.inputTokens', to: 'int', onError: 0, onNull: 0 } },
                contextOutputTokens: { $convert: { input: '$interactions.context.outputTokens', to: 'int', onError: 0, onNull: 0 } },
                // We need answer lookup for tokens and answerType
                answerId: '$interactions.answer',
                expertFeedbackId: '$interactions.expertFeedback',
                publicFeedbackId: '$interactions.publicFeedback',
                autoEvalId: '$interactions.autoEval'
            }
        }
    ];

    // Apply department filter after context is projected
    if (departmentFilter.length > 0) {
        stages.push({ $match: { $and: departmentFilter } });
    }

    return stages;
}

function buildOverallStatsPipeline(dateFilter, extraFilters = [], departmentFilter = [], answerTypeFilter = null, partnerEvalFilter = null, aiEvalFilter = null) {
    const stages = getBasePipelineStages(dateFilter, extraFilters, departmentFilter);

    // Lookup answer for tokens and answerType
    stages.push({
        $lookup: {
            from: 'answers',
            localField: 'answerId',
            foreignField: '_id',
            as: 'answer'
        }
    });
    stages.push({
        $addFields: {
            answer: { $arrayElemAt: ['$answer', 0] }
        }
    });

    // Project minimal answer fields + Tokens
    stages.push({
        $project: {
            chatId: 1,
            searchProvider: 1,
            pageLanguage: 1,
            department: 1,
            inputTokens: {
                $add: [
                    '$contextInputTokens',
                    { $convert: { input: '$answer.inputTokens', to: 'int', onError: 0, onNull: 0 } }
                ]
            },
            outputTokens: {
                $add: [
                    '$contextOutputTokens',
                    { $convert: { input: '$answer.outputTokens', to: 'int', onError: 0, onNull: 0 } }
                ]
            },
            answerType: { $ifNull: ['$answer.answerType', 'normal'] },
            // Keep IDs for further lookups if needed
            expertFeedbackId: 1,
            autoEvalId: 1
        }
    });

    // 1. Answer Type Filter
    if (answerTypeFilter) {
        stages.push({ $match: answerTypeFilter });
    }

    // 2. Partner Eval Filter (Requires Lookup)
    if (partnerEvalFilter) {
        stages.push(
            {
                $lookup: {
                    from: 'expertfeedbacks',
                    localField: 'expertFeedbackId',
                    foreignField: '_id',
                    as: 'ef_filter'
                }
            },
            {
                $addFields: {
                    category: getPartnerEvalAggregationExpression({ $arrayElemAt: ['$ef_filter', 0] })
                }
            },
            { $match: partnerEvalFilter },
            { $project: { ef_filter: 0, category: 0 } } // Cleanup temporary fields
        );
    }

    // 3. AI Eval Filter (Requires Lookup)
    if (aiEvalFilter) {
        stages.push(
            {
                $lookup: {
                    from: 'evals',
                    localField: 'autoEvalId',
                    foreignField: '_id',
                    as: 'ae_filter_doc'
                }
            },
            {
                $lookup: {
                    from: 'expertfeedbacks',
                    localField: 'ae_filter_doc.expertFeedback',
                    foreignField: '_id',
                    as: 'ae_ef_filter'
                }
            },
            {
                $addFields: {
                    category: getAiEvalAggregationExpression({ $arrayElemAt: ['$ae_ef_filter', 0] })
                }
            },
            { $match: aiEvalFilter },
            { $project: { ae_filter_doc: 0, ae_ef_filter: 0, category: 0 } } // Cleanup
        );
    }

    // Aggregate
    stages.push({
        $group: {
            _id: null,
            totalQuestions: { $sum: 1 },
            totalQuestionsEn: { $sum: { $cond: [{ $eq: ['$pageLanguage', 'en'] }, 1, 0] } },
            totalQuestionsFr: { $sum: { $cond: [{ $eq: ['$pageLanguage', 'fr'] }, 1, 0] } },
            totalInputTokens: { $sum: '$inputTokens' },
            totalInputTokensEn: { $sum: { $cond: [{ $eq: ['$pageLanguage', 'en'] }, '$inputTokens', 0] } },
            totalInputTokensFr: { $sum: { $cond: [{ $eq: ['$pageLanguage', 'fr'] }, '$inputTokens', 0] } },
            totalOutputTokens: { $sum: '$outputTokens' },
            totalOutputTokensEn: { $sum: { $cond: [{ $eq: ['$pageLanguage', 'en'] }, '$outputTokens', 0] } },
            totalOutputTokensFr: { $sum: { $cond: [{ $eq: ['$pageLanguage', 'fr'] }, '$outputTokens', 0] } },
            totalGoogleSearches: { $sum: { $cond: [{ $eq: ['$searchProvider', 'google'] }, 1, 0] } },
            // Answer types
            normalCount: { $sum: { $cond: [{ $eq: ['$answerType', 'normal'] }, 1, 0] } },
            normalCountEn: { $sum: { $cond: [{ $and: [{ $eq: ['$answerType', 'normal'] }, { $eq: ['$pageLanguage', 'en'] }] }, 1, 0] } },
            normalCountFr: { $sum: { $cond: [{ $and: [{ $eq: ['$answerType', 'normal'] }, { $eq: ['$pageLanguage', 'fr'] }] }, 1, 0] } },
            clarifyingCount: { $sum: { $cond: [{ $eq: ['$answerType', 'clarifying-question'] }, 1, 0] } },
            clarifyingCountEn: { $sum: { $cond: [{ $and: [{ $eq: ['$answerType', 'clarifying-question'] }, { $eq: ['$pageLanguage', 'en'] }] }, 1, 0] } },
            clarifyingCountFr: { $sum: { $cond: [{ $and: [{ $eq: ['$answerType', 'clarifying-question'] }, { $eq: ['$pageLanguage', 'fr'] }] }, 1, 0] } },
            ptMuniCount: { $sum: { $cond: [{ $eq: ['$answerType', 'pt-muni'] }, 1, 0] } },
            ptMuniCountEn: { $sum: { $cond: [{ $and: [{ $eq: ['$answerType', 'pt-muni'] }, { $eq: ['$pageLanguage', 'en'] }] }, 1, 0] } },
            ptMuniCountFr: { $sum: { $cond: [{ $and: [{ $eq: ['$answerType', 'pt-muni'] }, { $eq: ['$pageLanguage', 'fr'] }] }, 1, 0] } },
            notGcCount: { $sum: { $cond: [{ $eq: ['$answerType', 'not-gc'] }, 1, 0] } },
            notGcCountEn: { $sum: { $cond: [{ $and: [{ $eq: ['$answerType', 'not-gc'] }, { $eq: ['$pageLanguage', 'en'] }] }, 1, 0] } },
            notGcCountFr: { $sum: { $cond: [{ $and: [{ $eq: ['$answerType', 'not-gc'] }, { $eq: ['$pageLanguage', 'fr'] }] }, 1, 0] } }
        }
    });

    return stages;
}

async function getUsageMetrics(req, res) {
    if (req.method !== 'GET') return res.status(405).json({ message: 'Method not allowed' });
    try {
        await dbConnect();
        const { dateFilter, extraFilterConditions, departmentFilter, answerTypeFilter, partnerEvalFilter, aiEvalFilter } = parseRequestFilters(req);

        if (!dateFilter.createdAt) return res.status(400).json({ error: 'Invalid date range' });

        const result = await executeWithRetry(() => Chat.aggregate(buildOverallStatsPipeline(dateFilter, extraFilterConditions, departmentFilter, answerTypeFilter, partnerEvalFilter, aiEvalFilter)).allowDiskUse(true));
        const overall = result[0] || {};

        const metrics = {
            totalQuestions: overall.totalQuestions || 0,
            totalQuestionsEn: overall.totalQuestionsEn || 0,
            totalQuestionsFr: overall.totalQuestionsFr || 0,
            totalInputTokens: overall.totalInputTokens || 0,
            totalInputTokensEn: overall.totalInputTokensEn || 0,
            totalInputTokensFr: overall.totalInputTokensFr || 0,
            totalOutputTokens: overall.totalOutputTokens || 0,
            totalOutputTokensEn: overall.totalOutputTokensEn || 0,
            totalOutputTokensFr: overall.totalOutputTokensFr || 0,
            totalGoogleSearches: overall.totalGoogleSearches || 0,
            answerTypes: {
                normal: { total: overall.normalCount || 0, en: overall.normalCountEn || 0, fr: overall.normalCountFr || 0 },
                'clarifying-question': { total: overall.clarifyingCount || 0, en: overall.clarifyingCountEn || 0, fr: overall.clarifyingCountFr || 0 },
                'pt-muni': { total: overall.ptMuniCount || 0, en: overall.ptMuniCountEn || 0, fr: overall.ptMuniCountFr || 0 },
                'not-gc': { total: overall.notGcCount || 0, en: overall.notGcCountEn || 0, fr: overall.notGcCountFr || 0 }
            }
        };
        return res.status(200).json({ success: true, metrics });
    } catch (error) {
        console.error('Error in usage metrics:', error);
        return res.status(500).json({ error: 'Failed to fetch usage metrics' });
    }
}

export default withProtection(getUsageMetrics);
