import dbConnect from './db-connect.js';
import { Chat } from '../../models/chat.js';
import { requireString, escapeRegex } from '../util/db-query.js';
import {
  authMiddleware,
  partnerOrAdminMiddleware,
  withProtection
} from '../../middleware/auth.js';

// Capped well below "browse everything" - this is meant to resolve a partial
// ID down to a short pick-list (ChatIdLookupField.js's matches UI), not page
// through results. MIN_QUERY_LENGTH keeps a 1-2 character query (which would
// match a large fraction of any real chatId collection) from ever reaching
// the database at all.
const MAX_RESULTS = 10;
const MIN_QUERY_LENGTH = 4;

async function chatSearchHandler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    await dbConnect();

    const { q } = req.query;
    if (!q || typeof q !== 'string' || !q.trim()) {
      return res.status(400).json({ error: 'q query parameter required' });
    }
    const query = requireString(q, 'q');
    if (query.length < MIN_QUERY_LENGTH) {
      return res.status(400).json({ error: `q must be at least ${MIN_QUERY_LENGTH} characters` });
    }

    // models/chat.js's chatId index speeds up db-chat.js's exact-match
    // Chat.findOne({ chatId }), but not this query: an unanchored $regex
    // can't use a B-tree index the way an equality or prefix match can, so
    // this is still a full collection scan. Fine at current admin/partner-
    // only, explicit-search-button-only call volume - validate with
    // explain() against the real DocumentDB cluster before assuming
    // otherwise if that changes (see AGENTS.md).
    //
    // limit(MAX_RESULTS + 1) rather than a separate count query - one extra
    // row over the cap is enough to know whether more matches exist beyond
    // what's returned.
    const chats = await Chat.find({ chatId: { $regex: escapeRegex(query), $options: 'i' } })
      .select('chatId')
      .sort({ createdAt: -1 })
      .limit(MAX_RESULTS + 1)
      .lean();

    const chatIds = chats.slice(0, MAX_RESULTS).map((chat) => chat.chatId);
    return res.status(200).json({
      chatIds,
      truncated: chats.length > MAX_RESULTS
    });
  } catch (error) {
    console.error('Error searching chats:', error);
    return res.status(500).json({ error: 'Failed to search chats' });
  }
}

export default function handler(req, res) {
  return withProtection(
    chatSearchHandler,
    authMiddleware,
    partnerOrAdminMiddleware
  )(req, res);
}
