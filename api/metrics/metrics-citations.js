import dbConnect from '../db/db-connect.js';
import { Chat } from '../../models/chat.js';
import { withProtection } from '../../middleware/auth.js';
import { parseRequestFilters, executeWithRetry } from './metrics-common.js';
import { normalizeReferralUrl } from '../util/normalizeReferralUrl.js';

const TOP_N = 20;

// Answer types tracked in the breakdown. `normal` answers are the ones that
// carry a citation; the other three intentionally don't. Mirrors the answerType
// values set by the pipeline (see MetricsService.calculateMetrics).
const ANSWER_TYPES = ['normal', 'clarifying-question', 'pt-muni', 'not-gc'];

// Top GC pages AI Answers cited, plus an answer-type breakdown. Counts at the
// QUESTION (interaction) level. One aggregation groups by (answerType, citation
// URL); Node then sums per answer type and merges/ranks the citation URLs. The
// breakdown needs every row, so the aggregation is uncapped — but it collapses
// to roughly (distinct citation URLs + one row per non-citation answer type),
// which is bounded like the referral list.
function buildCitationPipeline(dateFilter, extraFilters = [], departmentFilter = []) {
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
  ];

  if (departmentFilter.length > 0) {
    stages.push(
      {
        $lookup: {
          from: 'contexts',
          localField: 'interactions.context',
          foreignField: '_id',
          as: 'ctx'
        }
      },
      { $addFields: { department: { $ifNull: [{ $arrayElemAt: ['$ctx.department', 0] }, 'Unknown'] } } },
      { $match: { $and: departmentFilter } },
    );
  }

  stages.push(
    {
      $lookup: {
        from: 'answers',
        localField: 'interactions.answer',
        foreignField: '_id',
        as: 'ans'
      }
    },
    { $addFields: { ans: { $arrayElemAt: ['$ans', 0] } } },
    {
      $lookup: {
        from: 'citations',
        localField: 'ans.citation',
        foreignField: '_id',
        as: 'cit'
      }
    },
    { $addFields: { cit: { $arrayElemAt: ['$cit', 0] } } },
    {
      $addFields: {
        answerType: { $ifNull: ['$ans.answerType', ''] },
        // Displayed citation URL: providedCitationUrl, falling back to the AI's
        // proposed aiCitationUrl when the provided one is empty (matches how the
        // chat UI and export resolve the citation link).
        citationUrl: {
          $let: {
            vars: {
              p: { $ifNull: ['$cit.providedCitationUrl', ''] },
              a: { $ifNull: ['$cit.aiCitationUrl', ''] },
            },
            in: { $cond: [{ $ne: ['$$p', ''] }, '$$p', '$$a'] },
          },
        },
      },
    },
    { $group: { _id: { answerType: '$answerType', url: '$citationUrl' }, count: { $sum: 1 } } },
  );

  return stages;
}

async function getCitationMetrics(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ message: 'Method not allowed' });
  try {
    await dbConnect();
    const { dateFilter, extraFilterConditions, departmentFilter } = parseRequestFilters(req);
    if (!dateFilter.createdAt) return res.status(400).json({ error: 'Invalid date range' });

    const rows = await executeWithRetry(() =>
      Chat.aggregate(buildCitationPipeline(dateFilter, extraFilterConditions, departmentFilter)).allowDiskUse(true)
    );

    const answerTypeBreakdown = ANSWER_TYPES.reduce((acc, type) => ({ ...acc, [type]: 0 }), {});
    const mergedCitations = new Map();

    for (const row of rows) {
      const { answerType, url } = row._id || {};
      const count = row.count || 0;
      if (Object.prototype.hasOwnProperty.call(answerTypeBreakdown, answerType)) {
        answerTypeBreakdown[answerType] += count;
      }
      // Count any question whose answer produced a citation URL, regardless of
      // answer type; normalizeReferralUrl drops blanks (and self-referrals).
      const page = url ? normalizeReferralUrl(url) : null;
      if (page) mergedCitations.set(page, (mergedCitations.get(page) || 0) + count);
    }

    const topCitations = [...mergedCitations.entries()]
      .map(([url, count]) => ({ url, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, TOP_N);

    return res.status(200).json({ success: true, metrics: { topCitations, answerTypeBreakdown } });
  } catch (error) {
    console.error('Error in citation metrics:', error);
    return res.status(500).json({ error: 'Failed to fetch citation metrics' });
  }
}

export default withProtection(getCitationMetrics);
