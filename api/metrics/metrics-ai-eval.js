import dbConnect from '../db/db-connect.js';
import { Chat } from '../../models/chat.js';
import { withProtection } from '../../middleware/auth.js';
import { getAiEvalAggregationExpression, getPartnerEvalAggregationExpression } from '../util/chat-filters.js';
import { parseRequestFilters, executeWithRetry } from './metrics-common.js';

function buildAiEvalPipeline(dateFilter, extraFilters = [], departmentFilter = [], answerTypeFilter = null, partnerEvalFilter = null, aiEvalFilter = null) {
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
            // Basic $lookup for DocumentDB 5 compatibility (pipeline-based lookups not supported)
            $lookup: {
                from: 'evals',
                localField: 'interactions.autoEval',
                foreignField: '_id',
                as: 'autoEval'
            }
        },
        // Strip large trace fields from eval documents immediately after lookup
        {
            $addFields: {
                autoEval: {
                    $map: {
                        input: '$autoEval',
                        as: 'e',
                        in: { _id: '$$e._id', expertFeedback: '$$e.expertFeedback' }
                    }
                }
            }
        },
        {
            $addFields: {
                department: { $arrayElemAt: ['$ctx.department', 0] },
                autoEval: { $arrayElemAt: ['$autoEval', 0] }
            }
        },
        // Apply department filter after context lookup
        ...(departmentFilter.length > 0 ? [{ $match: { $and: departmentFilter } }] : []),
        { $match: { autoEval: { $ne: null } } },
        {
            $lookup: {
                from: 'expertfeedbacks',
                localField: 'autoEval.expertFeedback',
                foreignField: '_id',
                as: 'autoEvalFeedback'
            }
        },
        {
            $addFields: {
                'autoEval.expertFeedback': { $arrayElemAt: ['$autoEvalFeedback', 0] }
            }
        },
        { $match: { 'autoEval.expertFeedback': { $ne: null } } },
        {
            $addFields: {
                category: getAiEvalAggregationExpression('$autoEval.expertFeedback')
            }
        },
        // Project only fields needed for aggregation (optimization)
        {
            $project: {
                pageLanguage: 1,
                department: 1,
                category: 1,
                // Keep IDs for potential cross-filter lookups
                answerId: '$interactions.answer',
                expertFeedbackId: '$interactions.expertFeedback'
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
                    partnerCategory: getPartnerEvalAggregationExpression({ $arrayElemAt: ['$pe_filter', 0] })
                }
            }
        );
        // Remap filter key from 'category' to 'partnerCategory'
        const remappedFilter = {};
        for (const key in partnerEvalFilter) {
            if (key === 'category') remappedFilter['partnerCategory'] = partnerEvalFilter[key];
            else remappedFilter[key] = partnerEvalFilter[key];
        }
        stages.push(
            { $match: remappedFilter },
            { $project: { pe_filter: 0, partnerCategory: 0 } }
        );
    }

    // 3. AI Eval Filter
    if (aiEvalFilter) {
        stages.push({ $match: aiEvalFilter });
    }

    stages.push({
        $group: {
            _id: null,
            total: { $sum: 1 },
            totalEn: { $sum: { $cond: [{ $eq: ['$pageLanguage', 'en'] }, 1, 0] } },
            totalFr: { $sum: { $cond: [{ $eq: ['$pageLanguage', 'fr'] }, 1, 0] } },
            correct: { $sum: { $cond: [{ $eq: ['$category', 'correct'] }, 1, 0] } },
            correctEn: { $sum: { $cond: [{ $and: [{ $eq: ['$category', 'correct'] }, { $eq: ['$pageLanguage', 'en'] }] }, 1, 0] } },
            correctFr: { $sum: { $cond: [{ $and: [{ $eq: ['$category', 'correct'] }, { $eq: ['$pageLanguage', 'fr'] }] }, 1, 0] } },
            needsImprovement: { $sum: { $cond: [{ $eq: ['$category', 'needsImprovement'] }, 1, 0] } },
            needsImprovementEn: { $sum: { $cond: [{ $and: [{ $eq: ['$category', 'needsImprovement'] }, { $eq: ['$pageLanguage', 'en'] }] }, 1, 0] } },
            needsImprovementFr: { $sum: { $cond: [{ $and: [{ $eq: ['$category', 'needsImprovement'] }, { $eq: ['$pageLanguage', 'fr'] }] }, 1, 0] } },
            hasError: { $sum: { $cond: [{ $eq: ['$category', 'hasError'] }, 1, 0] } },
            hasErrorEn: { $sum: { $cond: [{ $and: [{ $eq: ['$category', 'hasError'] }, { $eq: ['$pageLanguage', 'en'] }] }, 1, 0] } },
            hasErrorFr: { $sum: { $cond: [{ $and: [{ $eq: ['$category', 'hasError'] }, { $eq: ['$pageLanguage', 'fr'] }] }, 1, 0] } },
            hasCitationError: { $sum: { $cond: [{ $eq: ['$category', 'hasCitationError'] }, 1, 0] } },
            hasCitationErrorEn: { $sum: { $cond: [{ $and: [{ $eq: ['$category', 'hasCitationError'] }, { $eq: ['$pageLanguage', 'en'] }] }, 1, 0] } },
            hasCitationErrorFr: { $sum: { $cond: [{ $and: [{ $eq: ['$category', 'hasCitationError'] }, { $eq: ['$pageLanguage', 'fr'] }] }, 1, 0] } },
            harmful: { $sum: { $cond: [{ $eq: ['$category', 'harmful'] }, 1, 0] } },
            harmfulEn: { $sum: { $cond: [{ $and: [{ $eq: ['$category', 'harmful'] }, { $eq: ['$pageLanguage', 'en'] }] }, 1, 0] } },
            harmfulFr: { $sum: { $cond: [{ $and: [{ $eq: ['$category', 'harmful'] }, { $eq: ['$pageLanguage', 'fr'] }] }, 1, 0] } }
        }
    });

    return stages;
}

async function getAiEvalMetrics(req, res) {
    if (req.method !== 'GET') return res.status(405).json({ message: 'Method not allowed' });
    try {
        await dbConnect();
        const { dateFilter, extraFilterConditions, departmentFilter, answerTypeFilter, partnerEvalFilter, aiEvalFilter } = parseRequestFilters(req);
        if (!dateFilter.createdAt) return res.status(400).json({ error: 'Invalid date range' });

        const result = await executeWithRetry(() => Chat.aggregate(buildAiEvalPipeline(dateFilter, extraFilterConditions, departmentFilter, answerTypeFilter, partnerEvalFilter, aiEvalFilter)).allowDiskUse(true));
        const aiStats = result[0] || {};

        const metrics = {
            aiScored: {
                total: { total: aiStats.total || 0, en: aiStats.totalEn || 0, fr: aiStats.totalFr || 0 },
                correct: { total: aiStats.correct || 0, en: aiStats.correctEn || 0, fr: aiStats.correctFr || 0 },
                needsImprovement: { total: aiStats.needsImprovement || 0, en: aiStats.needsImprovementEn || 0, fr: aiStats.needsImprovementFr || 0 },
                hasError: { total: aiStats.hasError || 0, en: aiStats.hasErrorEn || 0, fr: aiStats.hasErrorFr || 0 },
                hasCitationError: { total: aiStats.hasCitationError || 0, en: aiStats.hasCitationErrorEn || 0, fr: aiStats.hasCitationErrorFr || 0 },
                harmful: { total: aiStats.harmful || 0, en: aiStats.harmfulEn || 0, fr: aiStats.harmfulFr || 0 }
            }
        };
        return res.status(200).json({ success: true, metrics });
    } catch (error) {
        console.error('Error in AI Eval metrics:', error);
        return res.status(500).json({ error: 'Failed to fetch AI Eval metrics' });
    }
}

export default withProtection(getAiEvalMetrics);
