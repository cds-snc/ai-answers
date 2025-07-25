import dbConnect from './db-connect.js';
import { authMiddleware, adminMiddleware, withProtection } from '../../middleware/auth.js';
import { User } from '../../models/user.js';
import { Tool } from '../../models/tool.js';
import { Setting } from '../../models/setting.js';
import { Question } from '../../models/question.js';
import { Logs } from '../../models/logs.js';
import { Interaction } from '../../models/interaction.js';
import { ExpertFeedback } from '../../models/expertFeedback.js';
import { PublicFeedback } from '../../models/publicFeedback.js';
import { Eval } from '../../models/eval.js';
import { Embedding } from '../../models/embedding.js';
import { Context } from '../../models/context.js';
import { Citation } from '../../models/citation.js';
import { Chat } from '../../models/chat.js';
import { Batch } from '../../models/batch.js';
import { Answer } from '../../models/answer.js';

const MODELS = {
  User,
  Tool,
  Setting,
  Question,
  Logs,
  Interaction,
  ExpertFeedback,
  PublicFeedback,
  Eval,
  Embedding,
  Context,
  Citation,
  Chat,
  Batch,
  Answer,
};

async function tableCountsHandler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }
  try {
    await dbConnect();
    const counts = {};
    for (const [name, Model] of Object.entries(MODELS)) {
      counts[name] = await Model.countDocuments();
    }
    res.status(200).json({ counts });
  } catch (error) {
    res.status(500).json({ message: 'Failed to get table counts', error: error.message });
  }
}

export default function handler(req, res) {
  return withProtection(tableCountsHandler, authMiddleware, adminMiddleware)(req, res);
}
