// The chats of one batch, fully populated, for the Batches page's CSV and
// Excel export (src/pages/BatchPage.js -> BatchService.retrieveBatchChats).
// That is its only caller. The dashboards' filters are served by
// api/chat/chat-dashboard.js, api/eval/eval-dashboard.js and
// api/chat/chat-export-logs.js.
//
// Partners and admins can call this, and only for a batch they may access
// (its creator or an admin, AIA-001), so it does only what the export needs:
// a batchId is required and any other parameter is refused, so a direct call
// can't read chats outside a batch.

import dbConnect from './db-connect.js';
import { Chat } from '../../models/chat.js';
import { BatchItem } from '../../models/batchItem.js';
import { findAccessibleBatch } from '../util/batch-access.js';
import { requireObjectIdString } from '../util/db-query.js';
import {
  authMiddleware,
  partnerOrAdminMiddleware,
  withProtection
} from '../../middleware/auth.js';

const ALLOWED_PARAMS = new Set(['batchId', 'limit']);
// Above MAX_BATCH_ITEMS (src/config/batch.js, 200) on purpose: batches made
// before that cap can hold more chats, and a lower limit would cut their
// exports short.
const MAX_LIMIT = 1000;

const chatPopulate = [
  // Email only: never the owner's other fields.
  { path: 'user', select: 'email' },
  {
    path: 'interactions',
    populate: [
      { path: 'context' },
      { path: 'expertFeedback', model: 'ExpertFeedback', select: '-__v' },
      { path: 'publicFeedback', model: 'PublicFeedback', select: '-__v' },
      { path: 'question', select: '-embedding' },
      {
        path: 'answer',
        select: '-embedding -sentenceEmbeddings',
        populate: [
          { path: 'sentences' },
          { path: 'citation' },
          { path: 'tools' }
        ]
      },
      {
        path: 'autoEval',
        model: 'Eval',
        populate: {
          path: 'expertFeedback',
          model: 'ExpertFeedback',
          select: '-__v'
        }
      }
    ]
  }
];

function parseLimit(value) {
  if (value === undefined) return MAX_LIMIT;
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return null;
  const limit = Number(value);
  return limit >= 1 && limit <= MAX_LIMIT ? limit : null;
}

async function chatLogsHandler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const unsupported = Object.keys(req.query || {}).filter((key) => !ALLOWED_PARAMS.has(key));
  if (unsupported.length) {
    return res.status(400).json({ error: `Unsupported parameter: ${unsupported.join(', ')}` });
  }
  const limit = parseLimit(req.query.limit);
  if (limit === null) {
    return res.status(400).json({ error: `limit must be a whole number from 1 to ${MAX_LIMIT}` });
  }

  try {
    // A missing or invalid batchId throws into the catch below (500), as it
    // did before this endpoint was narrowed to batch exports.
    const batchId = requireObjectIdString(req.query.batchId, 'batchId');
    await dbConnect();
    // Same rule as the batch endpoints (AIA-001): creator or admin only.
    if (!(await findAccessibleBatch(req.user, batchId, { _id: 1 }))) {
      return res.status(404).json({ error: 'Batch not found' });
    }
    // No date window: a batch's chats are exported whenever the batch ran.
    const batchItems = await BatchItem.find({ batch: batchId }).select('chat').lean();
    const chatIds = batchItems.map((item) => item.chat).filter(Boolean);

    const chats = chatIds.length
      ? await Chat.find({ _id: { $in: chatIds } })
        .sort({ _id: 1 })
        .limit(limit)
        .populate(chatPopulate)
        .lean()
      : [];

    return res.status(200).json({ success: true, logs: chats });
  } catch (error) {
    console.error('db-chat-logs error:', error);
    return res.status(500).json({ error: 'Failed to fetch logs' });
  }
}

export default function handler(req, res) {
  return withProtection(
    chatLogsHandler,
    authMiddleware,
    partnerOrAdminMiddleware
  )(req, res);
}
