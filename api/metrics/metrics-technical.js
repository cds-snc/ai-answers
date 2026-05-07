import dbConnect from '../db/db-connect.js';
import { Chat } from '../../models/chat.js';
import { authMiddleware, partnerOrAdminMiddleware, withProtection } from '../../middleware/auth.js';
import { getPartnerEvalAggregationExpression, getAiEvalAggregationExpression } from '../util/chat-filters.js';
import {
    parseRequestFilters,
    executeWithRetry,
    getBaseInteractionPipeline
} from './metrics-common.js';

const MAX_DOWNLOAD_POSITIONS = 5;

// Common stages: Chat → Interaction → Context → (filters) → Answer → Tools.
// Returns documents with chatId, rt, and a downloadCalls array (in original tool order).
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

    // Final projection: keep only the fields the JS percentile calc needs.
    // downloadCalls is re-ordered to match the original answer.tools array order
    // (since $lookup result order is not guaranteed) and filtered to downloadWebPage only.
    stages.push({
        $project: {
            _id: 0,
            chatId: 1,
            rt: { $convert: { input: '$interactions.responseTime', to: 'int', onError: 0, onNull: 0 } },
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

// JS-side percentile from a sorted array of numbers. Returns null if empty.
function percentile(sortedAsc, p) {
    const n = sortedAsc.length;
    if (n === 0) return null;
    const idx = Math.min(Math.floor(n * p), n - 1);
    return sortedAsc[idx];
}

function computeResponseTimeStats(rows) {
    const valid = rows.filter(r => typeof r.rt === 'number' && r.rt > 0);
    if (valid.length === 0) {
        return { count: 0, median: 0, p90: 0, p95: 0, max: 0, maxChatId: '' };
    }
    valid.sort((a, b) => a.rt - b.rt);
    const sortedRt = valid.map(r => r.rt);
    const last = valid[valid.length - 1];
    return {
        count: valid.length,
        median: percentile(sortedRt, 0.5) || 0,
        p90: percentile(sortedRt, 0.9) || 0,
        p95: percentile(sortedRt, 0.95) || 0,
        max: last.rt,
        maxChatId: last.chatId || ''
    };
}

function computeDownloadStats(rows) {
    // For each call position 0..MAX-1, accumulate counts and durations.
    const buckets = Array.from({ length: MAX_DOWNLOAD_POSITIONS }, () => ({
        totalCount: 0,
        errorCount: 0,
        completedDurations: []
    }));
    for (const row of rows) {
        const calls = Array.isArray(row.downloadCalls) ? row.downloadCalls : [];
        for (let i = 0; i < calls.length && i < MAX_DOWNLOAD_POSITIONS; i++) {
            const c = calls[i];
            const b = buckets[i];
            b.totalCount++;
            if (c.status === 'error') {
                b.errorCount++;
            } else if (c.status === 'completed' && typeof c.duration === 'number') {
                b.completedDurations.push(c.duration);
            }
        }
    }
    return buckets
        .map((b, i) => {
            if (b.totalCount === 0) return null;
            const sorted = b.completedDurations.slice().sort((a, x) => a - x);
            return {
                callNumber: i + 1,
                totalCount: b.totalCount,
                errorCount: b.errorCount,
                completedCount: sorted.length,
                median: percentile(sorted, 0.5),
                p95: percentile(sorted, 0.95)
            };
        })
        .filter(Boolean);
}

async function getTechnicalMetrics(req, res) {
    if (req.method !== 'GET') return res.status(405).json({ message: 'Method not allowed' });
    try {
        await dbConnect();
        const { dateFilter, extraFilterConditions, departmentFilter, answerTypeFilter, partnerEvalFilter, aiEvalFilter } = parseRequestFilters(req);

        if (!dateFilter.createdAt) return res.status(400).json({ error: 'Invalid date range' });

        const stages = buildBaseStages(dateFilter, extraFilterConditions, departmentFilter, answerTypeFilter, partnerEvalFilter, aiEvalFilter);
        const rows = await executeWithRetry(() => Chat.aggregate(stages).allowDiskUse(true));

        const responseTime = computeResponseTimeStats(rows);
        const downloadWebPage = computeDownloadStats(rows);

        return res.status(200).json({
            success: true,
            metrics: { responseTime, downloadWebPage }
        });
    } catch (error) {
        console.error('Error in technical metrics:', error);
        return res.status(500).json({ error: 'Failed to fetch technical metrics' });
    }
}

export default withProtection(getTechnicalMetrics, authMiddleware, partnerOrAdminMiddleware);
