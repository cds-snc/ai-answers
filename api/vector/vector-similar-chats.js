// api/vector/similar-chats.js
import { withProtection, authMiddleware, adminMiddleware } from '../../middleware/auth.js';
import dbConnect from '../db/db-connect.js';
import { Chat } from '../../models/chat.js';
import { Embedding } from '../../models/embedding.js';
import { VectorService } from '../../services/VectorServiceFactory.js';

async function similarChatsHandler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }
  await dbConnect();
  try {
    const { chatId, limit = 20 } = req.query;
    if (!chatId) {
      return res.status(400).json({ message: 'chatId is required' });
    }
    // Find the Chat document by chatId string
    const chatRecord = await Chat.findOne({ chatId });
    if (!chatRecord) {
      return res.status(404).json({ message: 'No chat found for chatId' });
    }
    // Get embeddings for the Chat's _id
    const embeddings = await Embedding.find({ chatId: chatRecord._id });
    if (!embeddings.length) {
      return res.status(404).json({ message: 'No embeddings found for chatId' });
    }
    // Use questionsAnswerEmbedding for similarity search (to match evaluation.worker.js)
    const queryEmbedding = embeddings[0].questionsAnswerEmbedding;
    if (!queryEmbedding) {
      return res.status(400).json({ message: 'No valid embedding found for chatId' });
    }
    // Use VectorService to find similar chats
    const similar = await VectorService.findSimilarChats(queryEmbedding, { excludeChatId: String(chatRecord._id), limit: Number(limit) });
    // Fetch chat metadata for results using chatId string field
    const chatIds = similar.map(s => s.chatId).filter(Boolean);
    const chats = await Chat.find({ chatId: { $in: chatIds } }).lean();
    // Merge similarity score with chat info using chatId
    const results = chats.map(chat => {
      const sim = similar.find(s => String(s.chatId) === String(chat.chatId));
      return { ...chat, similarity: sim?.score, user: chat.user ?? '' };
    });
    return res.status(200).json({ success: true, chats: results });
  } catch (error) {
    console.error('Error finding similar chats:', error);
    return res.status(500).json({ message: 'Failed to find similar chats', error: error.message });
  }
}

export default function handler(req, res) {
  return withProtection(similarChatsHandler, authMiddleware, adminMiddleware)(req, res);
}
