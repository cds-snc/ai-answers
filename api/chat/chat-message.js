import { AnswerGenerationService } from '../../services/AnswerGenerationService.js';
import ServerLoggingService from '../../services/ServerLoggingService.js';
import { withSession } from '../../middleware/chat-session.js';
import { withOptionalUser } from '../../middleware/auth.js';

async function handler(req, res) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', ['POST']);
        return res.status(405).end(`Method ${req.method} Not Allowed`);
    }

    try {
        const result = await AnswerGenerationService.generateAnswer(req.body, req.chatId);
        return res.json(result);
    } catch (error) {
        ServerLoggingService.error(`Error in ${req.body?.provider || 'chat'} handler:`, req.chatId, error);
        return res.status(500).json({ error: 'Error processing your request', details: error.message });
    }
}

export default withOptionalUser(withSession(handler));
