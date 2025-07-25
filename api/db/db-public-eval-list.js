import dbConnect from './db-connect.js';
import { Chat } from '../../models/chat.js';
import { Interaction } from '../../models/interaction.js';
import { Context } from '../../models/context.js';
import { authMiddleware, adminMiddleware, withProtection } from '../../middleware/auth.js';

async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  try {
    await dbConnect();
    // Find chats with no user, populate interactions and their context
    const chats = await Chat.find({ user: { $exists: false } })
      .select('chatId interactions updatedAt createdAt')
      .populate({
        path: 'interactions',
        select: 'context updatedAt createdAt expertFeedback',
        populate: {
          path: 'context',
          select: 'department',
        },
      })
      .sort({ updatedAt: -1, createdAt: -1 })
      .lean();

    const items = chats
      .map((chat) => {
        // Filter interactions with no expertFeedback
        const filteredInteractions = (chat.interactions || []).filter(
          (i) => !i.expertFeedback
        );
        if (filteredInteractions.length === 0) return null;
        // Use the context of the first such interaction
        const firstInteraction = filteredInteractions[0];
        let department = '';
        if (firstInteraction && firstInteraction.context && firstInteraction.context.department) {
          department = firstInteraction.context.department;
        }
        const date = chat.updatedAt ? new Date(chat.updatedAt).toISOString() : (chat.createdAt ? new Date(chat.createdAt).toISOString() : '');
        return {
          chatId: chat.chatId,
          department,
          date,
        };
      })
      .filter(Boolean);

    res.status(200).json({ chats: items });
  } catch (error) {
    console.error('Error fetching public evaluation list:', error);
    res.status(500).json({ message: 'Failed to fetch list', error: error.message });
  }
}

export default function handlerWrapper(req, res) {
  return withProtection(handler, authMiddleware, adminMiddleware)(req, res);
}
