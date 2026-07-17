import { Chat } from '../models/chat.js';
import {
  getBaseInteractionPipeline,
  executeWithRetry
} from '../api/metrics/metrics-common.js';
import {
  getPartnerEvalAggregationExpression,
  getAiEvalAggregationExpression
} from '../api/util/chat-filters.js';

const MAX_DOWNLOAD_POSITIONS = 5;

function buildTechnicalBaseStages(dateFilter, extraFilters, departmentFilter, answerTypeFilter, partnerEvalFilter, aiEvalFilter) {
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
    for (const [key, value] of Object.entries(answerTypeFilter)) {
      answerTypeMatch[`answer.${key}`] = value;
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
    },
    {
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
    }
  );

  return stages;
}

function percentile(sortedAsc, p) {
  const n = sortedAsc.length;
  if (n === 0) return null;
  const idx = Math.min(Math.floor(n * p), n - 1);
  return sortedAsc[idx];
}

function computeResponseTimeStats(rows) {
  const valid = rows.filter((row) => typeof row.rt === 'number' && row.rt > 0);
  if (valid.length === 0) {
    return { count: 0, median: 0, p90: 0, p95: 0, max: 0, maxChatId: '' };
  }

  valid.sort((a, b) => a.rt - b.rt);
  const sortedRt = valid.map((row) => row.rt);
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
  const buckets = Array.from({ length: MAX_DOWNLOAD_POSITIONS }, () => ({
    totalCount: 0,
    errorCount: 0,
    completedDurations: []
  }));

  for (const row of rows) {
    const calls = Array.isArray(row.downloadCalls) ? row.downloadCalls : [];
    for (let i = 0; i < calls.length && i < MAX_DOWNLOAD_POSITIONS; i++) {
      const call = calls[i];
      const bucket = buckets[i];
      bucket.totalCount++;

      if (call.status === 'error') {
        bucket.errorCount++;
      } else if (call.status === 'completed' && typeof call.duration === 'number') {
        bucket.completedDurations.push(call.duration);
      }
    }
  }

  return buckets
    .map((bucket, index) => {
      if (bucket.totalCount === 0) return null;
      const sorted = bucket.completedDurations.slice().sort((a, b) => a - b);
      return {
        callNumber: index + 1,
        totalCount: bucket.totalCount,
        errorCount: bucket.errorCount,
        completedCount: sorted.length,
        median: percentile(sorted, 0.5),
        p95: percentile(sorted, 0.95)
      };
    })
    .filter(Boolean);
}

class MetricsService {
  static async getTechnicalMetrics({
    dateFilter,
    extraFilterConditions = [],
    departmentFilter = [],
    answerTypeFilter = null,
    partnerEvalFilter = null,
    aiEvalFilter = null
  }) {
    const stages = buildTechnicalBaseStages(
      dateFilter,
      extraFilterConditions,
      departmentFilter,
      answerTypeFilter,
      partnerEvalFilter,
      aiEvalFilter
    );

    const rows = await executeWithRetry(() => Chat.aggregate(stages).allowDiskUse(true));
    return {
      responseTime: computeResponseTimeStats(rows),
      downloadWebPage: computeDownloadStats(rows)
    };
  }
}

export default MetricsService;
