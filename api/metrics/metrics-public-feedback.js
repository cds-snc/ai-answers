import dbConnect from '../db/db-connect.js';
import { Chat } from '../../models/chat.js';
import { withProtection } from '../../middleware/auth.js';
import { getPartnerEvalAggregationExpression, getAiEvalAggregationExpression } from '../util/chat-filters.js';
import { parseRequestFilters, executeWithRetry } from './metrics-common.js';

/**
 * Builds the shared base pipeline stages that all public feedback queries use.
 * This includes lookups for interactions, contexts, publicfeedbacks, and all cross-filters.
 */
function buildBasePipeline(dateFilter, extraFilters = [], departmentFilter = [], answerTypeFilter = null, partnerEvalFilter = null, aiEvalFilter = null) {
    const stages = [
        { $match: dateFilter },
        {
            $lookup: {
                from: 'interactions',
                localField: 'interactions',
                foreignField: '_id',
                as: 'interactions'
            }
        },
        { $unwind: '$interactions' },
        ...(extraFilters.length > 0 ? [{ $match: { $and: extraFilters } }] : []),
        {
            $lookup: {
                from: 'contexts',
                localField: 'interactions.context',
                foreignField: '_id',
                as: 'ctx'
            }
        },
        {
            $lookup: {
                from: 'publicfeedbacks',
                localField: 'interactions.publicFeedback',
                foreignField: '_id',
                as: 'pf'
            }
        },
        {
            $addFields: {
                department: { $arrayElemAt: ['$ctx.department', 0] },
                publicFeedback: { $arrayElemAt: ['$pf', 0] }
            }
        },
        // Apply department filter after context lookup
        ...(departmentFilter.length > 0 ? [{ $match: { $and: departmentFilter } }] : []),
        { $match: { publicFeedback: { $ne: null } } },
        // Project only fields needed for aggregation (optimization)
        {
            $project: {
                pageLanguage: 1,
                department: 1,
                publicFeedback: 1,
                // Keep IDs for potential cross-filter lookups
                answerId: '$interactions.answer',
                expertFeedbackId: '$interactions.expertFeedback',
                autoEvalId: '$interactions.autoEval'
            }
        }
    ];

    // 1. Answer Type Filter
    if (answerTypeFilter) {
        stages.push(
            {
                $lookup: {
                    from: 'answers',
                    localField: 'answerId',
                    foreignField: '_id',
                    as: 'ans_filter'
                }
            },
            {
                $addFields: {
                    answerType: { $ifNull: [{ $arrayElemAt: ['$ans_filter.answerType', 0] }, 'normal'] }
                }
            },
            { $match: answerTypeFilter },
            { $project: { ans_filter: 0, answerType: 0 } }
        );
    }

    // 2. Partner Eval Filter
    if (partnerEvalFilter) {
        stages.push(
            {
                $lookup: {
                    from: 'expertfeedbacks',
                    localField: 'expertFeedbackId',
                    foreignField: '_id',
                    as: 'pe_filter'
                }
            },
            {
                $addFields: {
                    category: getPartnerEvalAggregationExpression({ $arrayElemAt: ['$pe_filter', 0] })
                }
            },
            { $match: partnerEvalFilter },
            { $project: { pe_filter: 0, category: 0 } }
        );
    }

    // 3. AI Eval Filter
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
            { $project: { ae_filter_doc: 0, ae_ef_filter: 0, category: 0 } }
        );
    }

    return stages;
}

/**
 * Builds the totals aggregation pipeline (yes/no counts by language).
 */
function buildTotalsPipeline(dateFilter, extraFilters, departmentFilter, answerTypeFilter, partnerEvalFilter, aiEvalFilter) {
    const stages = buildBasePipeline(dateFilter, extraFilters, departmentFilter, answerTypeFilter, partnerEvalFilter, aiEvalFilter);
    stages.push({
        $group: {
            _id: null,
            totalWithFeedback: { $sum: 1 },
            yesCount: { $sum: { $cond: [{ $eq: ['$publicFeedback.feedback', 'yes'] }, 1, 0] } },
            noCount: { $sum: { $cond: [{ $eq: ['$publicFeedback.feedback', 'no'] }, 1, 0] } },
            yesCountEn: { $sum: { $cond: [{ $and: [{ $eq: ['$publicFeedback.feedback', 'yes'] }, { $eq: ['$pageLanguage', 'en'] }] }, 1, 0] } },
            yesCountFr: { $sum: { $cond: [{ $and: [{ $eq: ['$publicFeedback.feedback', 'yes'] }, { $eq: ['$pageLanguage', 'fr'] }] }, 1, 0] } },
            noCountEn: { $sum: { $cond: [{ $and: [{ $eq: ['$publicFeedback.feedback', 'no'] }, { $eq: ['$pageLanguage', 'en'] }] }, 1, 0] } },
            noCountFr: { $sum: { $cond: [{ $and: [{ $eq: ['$publicFeedback.feedback', 'no'] }, { $eq: ['$pageLanguage', 'fr'] }] }, 1, 0] } }
        }
    });
    return stages;
}

/**
 * Builds the "yes" reasons breakdown pipeline.
 */
function buildYesReasonsPipeline(dateFilter, extraFilters, departmentFilter, answerTypeFilter, partnerEvalFilter, aiEvalFilter) {
    const stages = buildBasePipeline(dateFilter, extraFilters, departmentFilter, answerTypeFilter, partnerEvalFilter, aiEvalFilter);
    stages.push(
        { $match: { 'publicFeedback.feedback': 'yes' } },
        {
            $group: {
                _id: { $ifNull: ['$publicFeedback.publicFeedbackReason', 'other'] },
                count: { $sum: 1 }
            }
        }
    );
    return stages;
}

/**
 * Builds the "no" reasons breakdown pipeline.
 */
function buildNoReasonsPipeline(dateFilter, extraFilters, departmentFilter, answerTypeFilter, partnerEvalFilter, aiEvalFilter) {
    const stages = buildBasePipeline(dateFilter, extraFilters, departmentFilter, answerTypeFilter, partnerEvalFilter, aiEvalFilter);
    stages.push(
        { $match: { 'publicFeedback.feedback': 'no' } },
        {
            $group: {
                _id: { $ifNull: ['$publicFeedback.publicFeedbackReason', 'other'] },
                count: { $sum: 1 }
            }
        }
    );
    return stages;
}

async function getPublicFeedbackMetrics(req, res) {
    if (req.method !== 'GET') return res.status(405).json({ message: 'Method not allowed' });
    try {
        await dbConnect();
        const { dateFilter, extraFilterConditions, departmentFilter, answerTypeFilter, partnerEvalFilter, aiEvalFilter } = parseRequestFilters(req);
        if (!dateFilter.createdAt) return res.status(400).json({ error: 'Invalid date range' });

        // Run queries sequentially to reduce peak memory usage on DocumentDB (with retry)
        const totalsResult = await executeWithRetry(() => Chat.aggregate(buildTotalsPipeline(dateFilter, extraFilterConditions, departmentFilter, answerTypeFilter, partnerEvalFilter, aiEvalFilter)).allowDiskUse(true));
        const yesReasonsResult = await executeWithRetry(() => Chat.aggregate(buildYesReasonsPipeline(dateFilter, extraFilterConditions, departmentFilter, answerTypeFilter, partnerEvalFilter, aiEvalFilter)).allowDiskUse(true));
        const noReasonsResult = await executeWithRetry(() => Chat.aggregate(buildNoReasonsPipeline(dateFilter, extraFilterConditions, departmentFilter, answerTypeFilter, partnerEvalFilter, aiEvalFilter)).allowDiskUse(true));

        const pf = totalsResult[0] || {};

        // Convert reason arrays to objects { reason: count }
        const yesReasons = {};
        yesReasonsResult.forEach(r => {
            yesReasons[r._id] = r.count;
        });
        const noReasons = {};
        noReasonsResult.forEach(r => {
            noReasons[r._id] = r.count;
        });

        const metrics = {
            publicFeedbackTotals: {
                totalQuestionsWithFeedback: pf.totalWithFeedback || 0,
                yes: pf.yesCount || 0,
                no: pf.noCount || 0,
                enYes: pf.yesCountEn || 0,
                enNo: pf.noCountEn || 0,
                frYes: pf.yesCountFr || 0,
                frNo: pf.noCountFr || 0
            },
            publicFeedbackReasons: {
                yes: yesReasons,
                no: noReasons
            }
        };
        return res.status(200).json({ success: true, metrics });
    } catch (error) {
        console.error('Error in public feedback metrics:', error);
        return res.status(500).json({ error: 'Failed to fetch public feedback metrics' });
    }
}

export default withProtection(getPublicFeedbackMetrics);
