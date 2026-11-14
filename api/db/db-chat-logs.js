// The chats of one batch, fully populated, for the Batches page's CSV and
// Excel export (src/pages/BatchPage.js -> BatchService.retrieveBatchChats).
// That is its only caller. The dashboards' filters are served by
// api/chat/chat-dashboard.js, api/eval/eval-dashboard.js and
// api/chat/chat-export-logs.js.
//
// Any signed-in user can call this, so it does only what the export needs:
// a batchId is required and any other parameter is refused, so a direct call
// can't read chats outside a batch.

import dbConnect from './db-connect.js';
import { Chat } from '../../models/chat.js';
import { BatchItem } from '../../models/batchItem.js';
import { normalizeObjectIdString } from '../util/db-query.js';
import {
  authMiddleware,
  withProtection
} from '../../middleware/auth.js';

const ALLOWED_PARAMS = new Set(['batchId', 'limit']);
// Batches hold at most MAX_BATCH_ITEMS (src/config/batch.js) chats.
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
  const batchId = normalizeObjectIdString(req.query.batchId);
  if (!batchId) {
    return res.status(400).json({ error: 'A valid batchId is required' });
  }
  const limit = parseLimit(req.query.limit);
  if (limit === null) {
    return res.status(400).json({ error: `limit must be a whole number from 1 to ${MAX_LIMIT}` });
  }

  try {
    await dbConnect();
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
    authMiddleware
  )(req, res);
}
