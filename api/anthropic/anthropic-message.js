// api/claude.js
import { createClaudeAgent } from '../../agents/AgentService.js';
import ServerLoggingService from '../../services/ServerLoggingService.js';

const NUM_RETRIES = 3;
const BASE_DELAY = 1000; // 1 second

const convertInteractionsToMessages = (interactions) => {
  let messages = [];
  // Reverse the interactions array to process them in reverse order.
  const reversedInteractions = [...interactions].reverse();
  for (let i = reversedInteractions.length - 1; i >= 0; i--) {
    messages.push({
      role: "user",
      content: reversedInteractions[i].interaction.question,
    });

    messages.push({
      role: "assistant",
      content: reversedInteractions[i].interaction.answer.content,
    });
  }
  return messages;
};

async function invokeHandler(req, res) {
  if (req.method === 'POST') {
    try {
      const { message, systemPrompt, conversationHistory, chatId = 'system' } = req.body;
      ServerLoggingService.info('Claude API request received', chatId);
      ServerLoggingService.debug('Request body:', chatId, { message, systemPrompt, conversationHistoryLength: conversationHistory.length });

      // Create agent (callbacks are automatically attached in AgentService)
      const claudeAgent = await createClaudeAgent(chatId);

      const messages = [
        {
          role: "system",
          content: systemPrompt,
        },
        ...convertInteractionsToMessages(conversationHistory),
        {
          role: "user",
          content: message,
        },
      ];

      let answer = await claudeAgent.invoke({
        messages: messages,
      });

      if (Array.isArray(answer.messages) && answer.messages.length > 0) {
        answer.messages.forEach((msg, index) => {
          ServerLoggingService.debug(`Claude Response [${index}]:`, chatId, {
            content: msg.content,
            classType: msg.constructor.name,
          });
        });
        const lastMessage = answer.messages[answer.messages.length - 1];
        
        // Get tool usage data from the agent's callback handler
        const toolUsage = claudeAgent.callbacks[0].getToolUsageSummary();
        ServerLoggingService.info('Tool usage summary:', chatId, toolUsage);

        const response = {
          content: lastMessage.content,
          inputTokens: lastMessage.response_metadata.usage.input_tokens,
          outputTokens: lastMessage.response_metadata.usage.output_tokens,
          model: lastMessage.response_metadata.model,
          toolUsage: toolUsage // Include tool usage data in the response
        };
        
        ServerLoggingService.info('Claude API request completed successfully', chatId, response);
        res.json(response);
      } else {
        throw new Error('Claude returned no messages');
      }
    } catch (error) {
      const chatId = req.body?.chatId || 'system';
      ServerLoggingService.error('Error calling Claude API:', chatId, error);
      res.status(500).json({ error: 'Error processing your request', details: error.message });
    }
  } else {
    res.setHeader('Allow', ['POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}

export default async function handler(req, res) {
  let lastError;

  for (let attempt = 0; attempt < NUM_RETRIES; attempt++) {
    try {
      return await invokeHandler(req, res);
    } catch (error) {
      lastError = error;
      ServerLoggingService.error(`Attempt ${attempt + 1} failed:`, req.body?.chatId || 'system', error);

      if (attempt < NUM_RETRIES - 1) {
        const delay = Math.pow(2, attempt) * BASE_DELAY;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  ServerLoggingService.error('All retry attempts failed', req.body?.chatId || 'system', lastError);
  return res.status(500).json({
    error: 'Failed after retries',
    details: lastError?.message
  });
}