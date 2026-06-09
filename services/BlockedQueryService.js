import dbConnect from '../api/db/db-connect.js';
import { BlockedQueryCounter } from '../models/blockedQueryCounter.js';
import { isReferredPublicUrl } from '../api/util/chat-filters.js';
import ServerLoggingService from './ServerLoggingService.js';
import { BLOCK_TYPES } from '../agents/graphs/guardrails/blockTypes.js';

export { BLOCK_TYPES };

const BLOCK_TYPE_SET = new Set(BLOCK_TYPES);

function normalizeLang(lang) {
  const l = String(lang || '').toLowerCase();
  if (l === 'en' || l === 'eng') return 'en';
  if (l === 'fr' || l === 'fra') return 'fr';
  return 'other';
}

function startOfUtcDay(date) {
  const d = new Date(date);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

// Coarse, mutually-exclusive user bucket. Mirrors the userType semantics in
// getChatFilterConditions: authenticated => admin; anonymous from a public GC
// page => referredPublic; any other anonymous => publicOther. The dashboard
// 'public' filter sums referredPublic + publicOther.
export function classifyUserType(user, referringUrl) {
  if (user) return 'admin';
  if (isReferredPublicUrl(referringUrl)) return 'referredPublic';
  return 'publicOther';
}

class BlockedQueryService {
  // Fire-and-forget. Records exactly one blocked query against its primary
  // bucket. Never throws — a counter failure must not affect the user response.
  static async record({ blockType, lang, user, referringUrl } = {}) {
    try {
      if (!BLOCK_TYPE_SET.has(blockType)) return;
      await dbConnect();
      await BlockedQueryCounter.updateOne(
        {
          date: startOfUtcDay(new Date()),
          type: blockType,
          lang: normalizeLang(lang),
          userType: classifyUserType(user, referringUrl),
        },
        { $inc: { count: 1 } },
        { upsert: true }
      );
    } catch (error) {
      // Swallow — counters are best-effort and must never break the pipeline.
      await ServerLoggingService.warn('BlockedQueryService.record failed', 'system', {
        error: error?.message || String(error),
        blockType,
      });
    }
  }

  // Aggregates blocked-query counts within [start, end] (Date objects), split by
  // language, for each block type. `userType` is the dashboard filter value
  // ('all' | 'public' | 'referredPublic' | 'admin'); department is intentionally
  // not a dimension (blocks happen before department is known).
  static async getBlockedMetrics({ start, end, userType } = {}) {
    await dbConnect();

    const match = {
      // Preserve the requested range exactly. The dashboard already passes
      // date/time boundaries, so rounding the start to UTC midnight would
      // over-count earlier blocks from the same day.
      date: { $gte: new Date(start), $lte: new Date(end) },
    };

    if (userType === 'admin') {
      match.userType = 'admin';
    } else if (userType === 'referredPublic') {
      match.userType = 'referredPublic';
    } else if (userType === 'public') {
      match.userType = { $in: ['referredPublic', 'publicOther'] };
    }
    // 'all' / undefined => no userType constraint

    const rows = await BlockedQueryCounter.aggregate([
      { $match: match },
      { $group: { _id: { type: '$type', lang: '$lang' }, count: { $sum: '$count' } } },
    ]);

    const blockedQueries = {};
    for (const type of BLOCK_TYPES) {
      blockedQueries[type] = { total: 0, en: 0, fr: 0 };
    }
    blockedQueries.total = { total: 0, en: 0, fr: 0 };

    for (const row of rows) {
      const type = row?._id?.type;
      const lang = row?._id?.lang;
      const count = row?.count || 0;
      if (!blockedQueries[type]) continue;
      blockedQueries[type].total += count;
      blockedQueries.total.total += count;
      if (lang === 'en') {
        blockedQueries[type].en += count;
        blockedQueries.total.en += count;
      } else if (lang === 'fr') {
        blockedQueries[type].fr += count;
        blockedQueries.total.fr += count;
      }
    }

    return { blockedQueries };
  }
}

export default BlockedQueryService;
