// api/chatgpt.js
import { createOpenAIAgent } from '../../agents/AgentFactory.js';
import ServerLoggingService from '../../services/ServerLoggingService.js';
import { ToolTrackingHandler } from '../../agents/ToolTrackingHandler.js';
import { withSession } from '../../middleware/session.js';

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

    
      console.log('OpenAI API request received');
      const { message, systemPrompt, conversationHistory, chatId } = req.body;
      console.log('Request body:', req.body);


      const openAIAgent = await createOpenAIAgent(chatId);

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

      let answer = await openAIAgent.invoke({
        messages: messages,
      });

      if (Array.isArray(answer.messages) && answer.messages.length > 0) {
        /*answer.messages.forEach((msg, index) => {
          ServerLoggingService.debug(`OpenAI Response [${index}]:`, chatId, {
            content: msg.content,
            classType: msg.constructor.name,
          });
        });*/
        const lastMessage = answer.messages[answer.messages.length - 1];
        
        // Find the correct tool tracking handler from callbacks
        let toolTrackingHandler = null;
        for (const callback of openAIAgent.callbacks) {
          if (callback instanceof ToolTrackingHandler) {
            toolTrackingHandler = callback;
            break;
          }
        }

        const toolUsage = toolTrackingHandler ? toolTrackingHandler.getToolUsageSummary() : {};
        ServerLoggingService.info('Tool usage summary:', chatId, toolUsage);

        const response = {
          content: lastMessage.content,
          inputTokens: lastMessage.response_metadata.tokenUsage.promptTokens,
          outputTokens: lastMessage.response_metadata.tokenUsage.completionTokens,
          model: lastMessage.response_metadata.model_name,
          tools: toolUsage // Include tool usage data in the response
        };
        ServerLoggingService.info('OpenAI API request completed successfully', chatId, response);
        res.json(response);
      } else {
        throw new Error('OpenAI returned no messages');
      }
    } catch (error) {
      const chatId = req.body?.chatId || 'system';
      ServerLoggingService.error('Error calling OpenAI API:', chatId, error);
      res.status(500).json({ error: 'Error processing your request', details: error.message });
    }
  } else {
    res.setHeader('Allow', ['POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}

async function handler(req, res) {
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

export default withSession(handler);