// api/chat/chat-context.js
import { invokeContextAgent } from '../../services/ContextAgentService.js';
import { exponentialBackoff } from '../../src/utils/backoff.js';
import { withSession } from '../../middleware/session.js';

async function handler(req, res) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', ['POST']);
        return res.status(405).end(`Method ${req.method} Not Allowed`);
    }
    try {
        const { provider = 'openai' } = req.body;
        const result = await exponentialBackoff(() => invokeContextAgent(provider, req.body));
        return res.json(result);
    } catch (error) {
        console.error('Error processing request:', error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
}

export default withSession(handler);
