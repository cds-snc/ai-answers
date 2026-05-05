import dbConnect from '../db/db-connect.js';
import { Chat } from '../../models/chat.js';
import { withProtection } from '../../middleware/auth.js';
import { getPartnerEvalAggregationExpression, getAiEvalAggregationExpression } from '../util/chat-filters.js';
import {
    parseRequestFilters,
    executeWithRetry,
    getBaseInteractionPipeline
} from './metrics-common.js';

const MAX_DOWNLOAD_POSITIONS = 5;

// Common stages shared by both aggregations: Chat → Interaction → Context →
// (filter on department/answerType/partnerEval/aiEval) → Answer → Tools →
// project to { chatId, rt, downloadCalls[] }.
function buildBaseStages(dateFilter, extraFilters, departmentFilter, answerTypeFilter, partnerEvalFilter, aiEvalFilter) {
    const stages = [
        ...getBaseInteractionPipeline(dateFilter, extraFilters),
    ];

    if (departmentFilter.length > 0) {
        stages.push(
            { $addFields: { department: { $arrayElemAt: ['$ctx.department', 0] } } },
            { $match: { $and: departmentFilter } }
        );
    }

    stages.push(
        {
            $lookup: {
                from: 'answers',
                localField: 'interactions.answer',
                foreignField: '_id',
                as: 'answer'
            }
        },
        { $addFields: { answer: { $arrayElemAt: ['$answer', 0] } } }
    );

    if (answerTypeFilter) {
        const answerTypeMatch = {};
        for (const [k, v] of Object.entries(answerTypeFilter)) {
            answerTypeMatch[`answer.${k}`] = v;
        }
        stages.push({ $match: answerTypeMatch });
    }

    if (partnerEvalFilter) {
        stages.push(
            {
                $lookup: {
                    from: 'expertfeedbacks',
                    localField: 'interactions.expertFeedback',
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
            { $project: { ae_filter_doc: 0, ae_ef_filter: 0, category: 0 } }
        );
    }

    stages.push(
        {
            $lookup: {
                from: 'tools',
                localField: 'answer.tools',
                foreignField: '_id',
                as: 'toolDocs'
            }
        }
    );

    stages.push({
        $project: {
            chatId: 1,
            rt: { $convert: { input: '$interactions.responseTime', to: 'int', onError: 0, onNull: 0 } },
            // Re-order tools to match the original answer.tools array order, then keep only downloadWebPage.
            downloadCalls: {
                $map: {
                    input: {
                        $filter: {
                            input: {
                                $map: {
                                    input: { $ifNull: ['$answer.tools', []] },
                                    as: 'tid',
                                    in: {
                                        $arrayElemAt: [
                                            {
                                                $filter: {
                                                    input: '$toolDocs',
                                                    as: 't',
                                                    cond: { $eq: ['$$t._id', '$$tid'] }
                                                }
                                            },
                                            0
                                        ]
                                    }
                                }
                            },
                            as: 't',
                            cond: { $eq: ['$$t.tool', 'downloadWebPage'] }
                        }
                    },
                    as: 'c',
                    in: { duration: '$$c.duration', status: '$$c.status' }
                }
            }
        }
    });

    return stages;
}

function buildResponseTimePipeline(baseStages) {
    return [
        ...baseStages,
        { $match: { rt: { $gt: 0 } } },
        { $sort: { rt: 1 } },
        {
            $group: {
                _id: null,
                values: { $push: '$rt' },
                chatIds: { $push: '$chatId' },
                count: { $sum: 1 }
            }
        },
        {
            $project: {
                _id: 0,
                count: 1,
                median: { $arrayElemAt: ['$values', { $floor: { $multiply: ['$count', 0.5] } }] },
                p90: { $arrayElemAt: ['$values', { $floor: { $multiply: ['$count', 0.9] } }] },
                p95: { $arrayElemAt: ['$values', { $floor: { $multiply: ['$count', 0.95] } }] },
                max: { $arrayElemAt: ['$values', { $subtract: ['$count', 1] }] },
                maxChatId: { $arrayElemAt: ['$chatIds', { $subtract: ['$count', 1] }] }
            }
        }
    ];
}

function buildDownloadWebPagePipeline(baseStages) {
    return [
        ...baseStages,
        { $unwind: { path: '$downloadCalls', includeArrayIndex: 'callIndex' } },
        { $match: { callIndex: { $lt: MAX_DOWNLOAD_POSITIONS } } },
        // Sort by callIndex then duration so $push captures durations in sorted order per group.
        { $sort: { callIndex: 1, 'downloadCalls.duration': 1 } },
        {
            $group: {
                _id: '$callIndex',
                totalCount: { $sum: 1 },
                errorCount: {
                    $sum: { $cond: [{ $eq: ['$downloadCalls.status', 'error'] }, 1, 0] }
                },
                allCalls: { $push: { status: '$downloadCalls.status', duration: '$downloadCalls.duration' } }
            }
        },
        {
            $project: {
                _id: 0,
                callIndex: '$_id',
                totalCount: 1,
                errorCount: 1,
                completedDurations: {
                    $map: {
                        input: {
                            $filter: {
                                input: '$allCalls',
                                as: 'd',
                                cond: { $eq: ['$$d.status', 'completed'] }
                            }
                        },
                        as: 'x',
                        in: '$$x.duration'
                    }
                }
            }
        },
        { $addFields: { completedCount: { $size: '$completedDurations' } } },
        {
            $project: {
                callIndex: 1,
                totalCount: 1,
                errorCount: 1,
                completedCount: 1,
                median: {
                    $cond: [
                        { $gt: ['$completedCount', 0] },
                        { $arrayElemAt: ['$completedDurations', { $floor: { $multiply: ['$completedCount', 0.5] } }] },
                        null
                    ]
                },
                p95: {
                    $cond: [
                        { $gt: ['$completedCount', 0] },
                        { $arrayElemAt: ['$completedDurations', { $floor: { $multiply: ['$completedCount', 0.95] } }] },
                        null
                    ]
                }
            }
        },
        { $sort: { callIndex: 1 } }
    ];
}

async function getTechnicalMetrics(req, res) {
    if (req.method !== 'GET') return res.status(405).json({ message: 'Method not allowed' });
    try {
        await dbConnect();
        const { dateFilter, extraFilterConditions, departmentFilter, answerTypeFilter, partnerEvalFilter, aiEvalFilter } = parseRequestFilters(req);

        if (!dateFilter.createdAt) return res.status(400).json({ error: 'Invalid date range' });

        const baseStages = buildBaseStages(dateFilter, extraFilterConditions, departmentFilter, answerTypeFilter, partnerEvalFilter, aiEvalFilter);

        // DocumentDB does not support $facet, so run the two aggregations separately in parallel.
        const [rtResult, dlResult] = await Promise.all([
            executeWithRetry(() => Chat.aggregate(buildResponseTimePipeline(baseStages)).allowDiskUse(true)),
            executeWithRetry(() => Chat.aggregate(buildDownloadWebPagePipeline(baseStages)).allowDiskUse(true))
        ]);

        const rt = rtResult[0] || {};
        const responseTime = {
            count: rt.count || 0,
            median: rt.median || 0,
            p90: rt.p90 || 0,
            p95: rt.p95 || 0,
            max: rt.max || 0,
            maxChatId: rt.maxChatId || ''
        };

        const downloadWebPage = (dlResult || []).map(row => ({
            callNumber: (row.callIndex || 0) + 1,
            totalCount: row.totalCount || 0,
            errorCount: row.errorCount || 0,
            completedCount: row.completedCount || 0,
            median: row.median ?? null,
            p95: row.p95 ?? null
        }));

        return res.status(200).json({
            success: true,
            metrics: { responseTime, downloadWebPage }
        });
    } catch (error) {
        console.error('Error in technical metrics:', error);
        // TEMP DEBUG: surface the underlying error so we can diagnose without server log access.
        return res.status(500).json({
            error: 'Failed to fetch technical metrics',
            debugMessage: error?.message,
            debugCode: error?.code,
            debugCodeName: error?.codeName,
            debugStack: error?.stack?.split('\n').slice(0, 6)
        });
    }
}

export default withProtection(getTechnicalMetrics);
