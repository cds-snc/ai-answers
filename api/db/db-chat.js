import dbConnect from './db-connect.js';
import { Chat } from '../../models/chat.js';
import { authMiddleware, adminMiddleware, withProtection } from '../../middleware/auth.js';

async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const { chatId } = req.query;
  if (!chatId) {
    return res.status(400).json({ message: 'chatId query parameter required' });
  }

  try {
    await dbConnect();
    const chat = await Chat.findOne({ chatId })
      .populate({
        path: 'interactions',
        populate: [
          { path: 'context' },
          { path: 'expertFeedback', model: 'ExpertFeedback', select: '-__v' },
          { path: 'question', select: '-embedding' },
          { path: 'answer', select: '-embedding -sentenceEmbeddings', populate: [
            { path: 'sentences' },
            { path: 'citation' },
            { path: 'tools' },
          ] },
        ],
      });

    if (!chat) {
      return res.status(404).json({ message: 'Chat not found' });
    }

    res.status(200).json({ chat });
  } catch (error) {
    console.error('Error fetching chat:', error);
    res.status(500).json({ message: 'Failed to fetch chat', error: error.message });
  }
}

export default function handlerWrapper(req, res) {
  return withProtection(handler, authMiddleware)(req, res);
}
