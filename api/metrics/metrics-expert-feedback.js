import dbConnect from '../db/db-connect.js';
import { Chat } from '../../models/chat.js';
import { withProtection } from '../../middleware/auth.js';
import { getPartnerEvalAggregationExpression, getAiEvalAggregationExpression } from '../util/chat-filters.js';
import { parseRequestFilters, executeWithRetry } from './metrics-common.js';

function buildExpertFeedbackPipeline(dateFilter, extraFilters = [], departmentFilter = [], answerTypeFilter = null, partnerEvalFilter = null, aiEvalFilter = null) {
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
                from: 'expertfeedbacks',
                localField: 'interactions.expertFeedback',
                foreignField: '_id',
                as: 'ef'
            }
        },
        {
            $addFields: {
                department: { $arrayElemAt: ['$ctx.department', 0] },
                expertFeedback: { $arrayElemAt: ['$ef', 0] }
            }
        },
        // Apply department filter after context lookup
        ...(departmentFilter.length > 0 ? [{ $match: { $and: departmentFilter } }] : []),
        { $match: { expertFeedback: { $ne: null } } },
        {
            $addFields: {
                category: getPartnerEvalAggregationExpression('$expertFeedback')
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
        stages.push({ $match: partnerEvalFilter });
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
                    aiCategory: getAiEvalAggregationExpression({ $arrayElemAt: ['$ae_ef_filter', 0] })
                }
            }
        );
        // Remap filter key from 'category' to 'aiCategory'
        const remappedFilter = {};
        for (const key in aiEvalFilter) {
            if (key === 'category') remappedFilter['aiCategory'] = aiEvalFilter[key];
            else remappedFilter[key] = aiEvalFilter[key];
        }
        stages.push(
            { $match: remappedFilter },
            { $project: { ae_filter_doc: 0, ae_ef_filter: 0, aiCategory: 0 } }
        );
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

async function getExpertMetrics(req, res) {
    if (req.method !== 'GET') return res.status(405).json({ message: 'Method not allowed' });
    try {
        await dbConnect();
        const { dateFilter, extraFilterConditions, departmentFilter, answerTypeFilter, partnerEvalFilter, aiEvalFilter } = parseRequestFilters(req);
        if (!dateFilter.createdAt) return res.status(400).json({ error: 'Invalid date range' });

        const result = await executeWithRetry(() => Chat.aggregate(buildExpertFeedbackPipeline(dateFilter, extraFilterConditions, departmentFilter, answerTypeFilter, partnerEvalFilter, aiEvalFilter)).allowDiskUse(true));
        const expert = result[0] || {};

        const metrics = {
            expertScored: {
                total: { total: expert.total || 0, en: expert.totalEn || 0, fr: expert.totalFr || 0 },
                correct: { total: expert.correct || 0, en: expert.correctEn || 0, fr: expert.correctFr || 0 },
                needsImprovement: { total: expert.needsImprovement || 0, en: expert.needsImprovementEn || 0, fr: expert.needsImprovementFr || 0 },
                hasError: { total: expert.hasError || 0, en: expert.hasErrorEn || 0, fr: expert.hasErrorFr || 0 },
                hasCitationError: { total: expert.hasCitationError || 0, en: expert.hasCitationErrorEn || 0, fr: expert.hasCitationErrorFr || 0 },
                harmful: { total: expert.harmful || 0, en: expert.harmfulEn || 0, fr: expert.harmfulFr || 0 }
            }
        };
        return res.status(200).json({ success: true, metrics });
    } catch (error) {
        console.error('Error in expert metrics:', error);
        return res.status(500).json({ error: 'Failed to fetch expert metrics' });
    }
}

export default withProtection(getExpertMetrics);
