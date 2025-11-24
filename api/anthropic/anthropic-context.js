import { invokeContextAgent } from '../../services/ContextAgentService.js';
import loadContextSystemPrompt from '../../agents/prompts/contextSystemPrompt.js';
import { exponentialBackoff } from '../../src/utils/backoff.js';
import { withSession } from '../../middleware/session.js';
import { withOptionalUser } from '../../middleware/auth.js';

async function handler(req, res) {
  if (req.method === 'POST') {
    console.log('Request body:', req.body);

    try {
      const lang = req.body.lang || 'en';
      const department = req.body.department || '';
      req.body.systemPrompt = await loadContextSystemPrompt(lang, department);
      const result = await exponentialBackoff(() => invokeContextAgent('anthropic', req.body));
      res.json(result);
    } catch (error) {
      console.error('Error processing request:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  } else {
    res.setHeader('Allow', ['POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }

}

export default withOptionalUser(withSession(handler));