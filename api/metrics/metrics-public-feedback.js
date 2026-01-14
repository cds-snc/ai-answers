import dbConnect from '../db/db-connect.js';
import { Chat } from '../../models/chat.js';
import { withProtection } from '../../middleware/auth.js';
import { getPartnerEvalAggregationExpression, getAiEvalAggregationExpression } from '../utils/chat-filters.js';
import { parseRequestFilters } from './metrics-common.js';

function buildPublicFeedbackPipeline(dateFilter, extraFilters = [], departmentFilter = [], answerTypeFilter = null, partnerEvalFilter = null, aiEvalFilter = null) {
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
                pageLanguage: { $arrayElemAt: ['$ctx.pageLanguage', 0] },
                department: { $arrayElemAt: ['$ctx.department', 0] },
                publicFeedback: { $arrayElemAt: ['$pf', 0] }
            }
        },
        // Apply department filter after context lookup
        ...(departmentFilter.length > 0 ? [{ $match: { $and: departmentFilter } }] : []),
        { $match: { publicFeedback: { $ne: null } } }
    ];

    // 1. Answer Type Filter
    if (answerTypeFilter) {
        stages.push(
            {
                $lookup: {
                    from: 'answers',
                    localField: 'interactions.answer',
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
            { $unset: ['ans_filter', 'answerType'] }
        );
    }

    // 2. Partner Eval Filter
    if (partnerEvalFilter) {
        stages.push(
            {
                $lookup: {
                    from: 'expertfeedbacks',
                    localField: 'interactions.expertFeedback',
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
            { $unset: ['pe_filter', 'category'] }
        );
    }

    // 3. AI Eval Filter
    if (aiEvalFilter) {
        stages.push(
            {
                $lookup: {
                    from: 'evals',
                    localField: 'interactions.autoEval',
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
            { $unset: ['ae_filter_doc', 'ae_ef_filter', 'category'] }
        );
    }

    // $facet for aggregating totals and reason breakdowns
    stages.push({
        $facet: {
            // Totals aggregation
            totals: [
                {
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
                }
            ],
            // Reason breakdown for "yes" feedback
            yesReasons: [
                { $match: { 'publicFeedback.feedback': 'yes' } },
                {
                    $group: {
                        _id: { $ifNull: ['$publicFeedback.publicFeedbackReason', 'other'] },
                        count: { $sum: 1 }
                    }
                }
            ],
            // Reason breakdown for "no" feedback
            noReasons: [
                { $match: { 'publicFeedback.feedback': 'no' } },
                {
                    $group: {
                        _id: { $ifNull: ['$publicFeedback.publicFeedbackReason', 'other'] },
                        count: { $sum: 1 }
                    }
                }
            ]
        }
    });
    return stages;
}

async function getPublicFeedbackMetrics(req, res) {
    if (req.method !== 'GET') return res.status(405).json({ message: 'Method not allowed' });
    try {
        await dbConnect();
        const { dateFilter, extraFilterConditions, departmentFilter, answerTypeFilter, partnerEvalFilter, aiEvalFilter } = parseRequestFilters(req);
        if (!dateFilter.createdAt) return res.status(400).json({ error: 'Invalid date range' });

        const result = await Chat.aggregate(buildPublicFeedbackPipeline(dateFilter, extraFilterConditions, departmentFilter, answerTypeFilter, partnerEvalFilter, aiEvalFilter));
        const facetResult = result[0] || {};
        const pf = facetResult.totals?.[0] || {};
        const yesReasonsArr = facetResult.yesReasons || [];
        const noReasonsArr = facetResult.noReasons || [];

        // Convert reason arrays to objects { reason: count }
        const yesReasons = {};
        yesReasonsArr.forEach(r => {
            yesReasons[r._id] = r.count;
        });
        const noReasons = {};
        noReasonsArr.forEach(r => {
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
