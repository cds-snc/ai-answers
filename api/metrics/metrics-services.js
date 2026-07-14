import dbConnect from '../db/db-connect.js';
import { Chat } from '../../models/chat.js';
import { withProtection } from '../../middleware/auth.js';
import { getPartnerEvalAggregationExpression, getAiEvalAggregationExpression } from '../util/chat-filters.js';
import { parseRequestFilters, executeWithRetry } from './metrics-common.js';

const MAX_SERVICES = 25;

// Question volume grouped by the per-question service classification
// (context.service — see docs/plans/service-action-classification.md).
// Mirrors buildDepartmentPipeline in metrics-departments.js, including the
// cross-filter support, but only counts volume. Unclassified ('' — historical
// or failed call) and low-confidence ('unknown') questions are folded into a
// single 'unknown' sentinel bucket the client translates for display.
function buildServicePipeline(dateFilter, extraFilters = [], departmentFilter = [], answerTypeFilter = null, partnerEvalFilter = null, aiEvalFilter = null) {
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
            $addFields: {
                department: { $ifNull: [{ $arrayElemAt: ['$ctx.department', 0] }, 'Unknown'] },
                service: {
                    $let: {
                        vars: { raw: { $ifNull: [{ $arrayElemAt: ['$ctx.service', 0] }, ''] } },
                        in: { $cond: [{ $in: ['$$raw', ['', 'unknown']] }, 'unknown', '$$raw'] }
                    }
                }
            }
        },
        // Apply department filter after context lookup
        ...(departmentFilter.length > 0 ? [{ $match: { $and: departmentFilter } }] : []),
        // Project only fields needed for aggregation + cross-filter lookups
        {
            $project: {
                service: 1,
                answerId: '$interactions.answer',
                autoEvalId: '$interactions.autoEval',
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
                    as: 'ef_filter'
                }
            },
            {
                $addFields: {
                    category: getPartnerEvalAggregationExpression({ $arrayElemAt: ['$ef_filter', 0] })
                }
            },
            { $match: partnerEvalFilter },
            { $project: { ef_filter: 0, category: 0 } }
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
                    aiCategory: getAiEvalAggregationExpression({ $arrayElemAt: ['$ae_ef_filter', 0] })
                }
            }
        );

        // Remap filter key
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
            _id: '$service',
            total: { $sum: 1 }
        }
    });
    stages.push({ $sort: { total: -1 } });
    stages.push({ $limit: MAX_SERVICES });
    return stages;
}

async function getServiceMetrics(req, res) {
    if (req.method !== 'GET') return res.status(405).json({ message: 'Method not allowed' });
    try {
        await dbConnect();
        const { dateFilter, extraFilterConditions, departmentFilter, answerTypeFilter, partnerEvalFilter, aiEvalFilter } = parseRequestFilters(req);
        if (!dateFilter.createdAt) return res.status(400).json({ error: 'Invalid date range' });

        const result = await executeWithRetry(() => Chat.aggregate(buildServicePipeline(dateFilter, extraFilterConditions, departmentFilter, answerTypeFilter, partnerEvalFilter, aiEvalFilter)).allowDiskUse(true));

        const topServices = result.map((row) => ({ service: row._id, count: row.total }));

        return res.status(200).json({ success: true, metrics: { topServices } });
    } catch (error) {
        console.error('Error in service metrics:', error);
        return res.status(500).json({ error: 'Failed to fetch service metrics' });
    }
}

export default withProtection(getServiceMetrics);
