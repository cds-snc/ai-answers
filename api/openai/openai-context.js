import { invokeContextAgent } from '../../services/ContextAgentService.js';
import { exponentialBackoff } from '../../src/utils/backoff.js';
import { withSession } from '../../middleware/session.js';

async function handler(req, res) {
  if (req.method === 'POST') {
    console.log('Request body:', req.body);
    
    try {
      const result = await exponentialBackoff(() => invokeContextAgent('openai', req.body));
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

export default withSession(handler);
