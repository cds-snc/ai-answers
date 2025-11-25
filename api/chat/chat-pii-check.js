import ServerLoggingService from '../../services/ServerLoggingService.js';
import { invokePIIAgent } from '../../services/PIIAgentService.js';
import { withSession } from '../../middleware/session.js';
import { withOptionalUser } from '../../middleware/auth.js';

async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  try {
    const { message, agentType = 'openai' } = req.body || {};
    const chatId = req.chatId;
    ServerLoggingService.info('PII check request received.', chatId, { agentType });

    const piiResult = await invokePIIAgent(agentType, { chatId, question: message });

    if (piiResult.pii !== null) {
      ServerLoggingService.info('PII detected:', chatId);
    }
    if (piiResult.blocked === true) {
      ServerLoggingService.info('Blocked:', chatId);
    }

    return res.json(piiResult);
  } catch (error) {
    ServerLoggingService.error('Error processing PII check.', req.chatId, error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}

export default withOptionalUser(withSession(handler));

