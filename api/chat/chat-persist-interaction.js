import { InteractionPersistenceService } from '../../services/InteractionPersistenceService.js';
import ServerLoggingService from '../../services/ServerLoggingService.js';
import { withOptionalUser } from '../../middleware/auth.js';
import { withSession } from '../../middleware/chat-session.js';

async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  try {
    const interaction = req.body;
    const forceFallbackEval = interaction.forceFallbackEval || false;
    // Remove flags that shouldn't be persisted directly if they are on the root object
    delete interaction.forceFallbackEval;

    await InteractionPersistenceService.persistInteraction(
      req.chatId,
      interaction,
      req.user,
      { forceFallbackEval }
    );

    res.status(200).json({ message: 'Interaction logged successfully', chatId: req.chatId });
  } catch (error) {
    if (error.message === 'chatId_required') {
      return res.status(400).json({ error: 'chatId_required' });
    }
    ServerLoggingService.error('Failed to log interaction', req.chatId, error);
    res.status(500).json({ message: 'Failed to log interaction', error: error.message });
  }
}

export default function handlerWithMiddleware(req, res) {
  return withOptionalUser(withSession(handler))(req, res);
}
