import { invokePIIAgent } from '../../../services/PIIAgentService.js';

export async function checkPII({ chatId = 'system', message, agentType = 'openai' }) {
  if (!message) return { pii: null, blocked: false };
  return invokePIIAgent(agentType, { chatId, question: message });
}
