import ServerLoggingService from '../../services/ServerLoggingService.js';
import { SearchContextService } from '../../services/SearchContextService.js';
import { withSession } from '../../middleware/chat-session.js';
import { withOptionalUser } from '../../middleware/auth.js';

async function handler(req, res) {
    if (req.method === 'POST') {
        const { message, chatId = 'system', searchService = 'canadaca', agentType = 'openai', referringUrl = '', translationData = null, lang: pageLanguage = '' } = req.body;

        try {
            const result = await SearchContextService.search({
                chatId,
                searchService,
                agentType,
                referringUrl,
                translationData,
                pageLanguage
            });
            res.json(result);
        } catch (error) {
            ServerLoggingService.error('Error processing search:', chatId, error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    } else {
        res.setHeader('Allow', ['POST']);
        res.status(405).end(`Method ${req.method} Not Allowed`);
    }

}

export default withOptionalUser(withSession(handler));

