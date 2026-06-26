import dbConnect from '../db/db-connect.js';
import { Chat } from '../../models/chat.js';
import { withProtection } from '../../middleware/auth.js';
import { parseRequestFilters, executeWithRetry } from './metrics-common.js';
import { normalizeReferralUrl } from '../util/normalizeReferralUrl.js';

// How many raw (pre-normalization) referrer rows to pull back before merging.
// Normalization only ever merges rows, so the top normalized pages are built
// from the highest-count raw rows — a generous cap keeps the top-20 accurate
// while bounding payload/memory.
const RAW_URL_CAP = 500;
const TOP_N = 20;

// Top referring pages that drove click-throughs to AI Answers. Counts at the
// CONVERSATION level (distinct chats), not the question level: a multi-question
// session from one page counts once, so pages with longer conversations aren't
// over-weighted. Honours date range, userType/url filters, and department (when
// a partner is selected the list is scoped to that department).
function buildReferralPipeline(dateFilter, extraFilters = [], departmentFilter = []) {
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

  // Department lives on the referenced Context, so the lookup is only needed
  // when a department filter is applied (the common "no partner selected" case
  // skips it entirely — much lighter).
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
    { $match: { 'interactions.referringUrl': { $exists: true, $nin: [null, ''] } } },
    // Collapse to distinct (referringUrl, chat) pairs first so each conversation
    // is counted once per page, then count pairs per raw URL. Two-stage grouping
    // avoids a large $addToSet of chat IDs (DocumentDB memory-friendly).
    { $group: { _id: { url: '$interactions.referringUrl', chat: '$_id' } } },
    { $group: { _id: '$_id.url', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: RAW_URL_CAP },
  );

  return stages;
}

async function getReferralMetrics(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ message: 'Method not allowed' });
  try {
    await dbConnect();
    const { dateFilter, extraFilterConditions, departmentFilter } = parseRequestFilters(req);
    if (!dateFilter.createdAt) return res.status(400).json({ error: 'Invalid date range' });

    const rows = await executeWithRetry(() =>
      Chat.aggregate(buildReferralPipeline(dateFilter, extraFilterConditions, departmentFilter)).allowDiskUse(true)
    );

    // Normalize raw referrers to a page key and merge their conversation counts;
    // normalizeReferralUrl drops blanks and AI Answers self-referrals.
    const merged = new Map();
    for (const row of rows) {
      const page = normalizeReferralUrl(row._id);
      if (!page) continue;
      merged.set(page, (merged.get(page) || 0) + row.count);
    }

    const topReferrals = [...merged.entries()]
      .map(([url, count]) => ({ url, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, TOP_N);

    return res.status(200).json({ success: true, metrics: { topReferrals } });
  } catch (error) {
    console.error('Error in referral metrics:', error);
    return res.status(500).json({ error: 'Failed to fetch referral metrics' });
  }
}

export default withProtection(getReferralMetrics);
