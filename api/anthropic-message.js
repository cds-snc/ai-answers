// api/claude.js
import { createClaudeAgent } from '../agents/AgentService.js';
const NUM_RETRIES = 3;
const BASE_DELAY = 1000; // 1 second

const convertInteractionsToMessages = (interactions) => {
  let messages = [];
  // Reverse the interactions array to process them in reverse order.
  const reversedInteractions = [...interactions].reverse();
  for (let i = reversedInteractions.length - 1; i >= 0; i--) {
    messages.push({
      role: 'user',
      content: reversedInteractions[i].interaction.question,
    });

    messages.push({
      role: 'assistant',
      content: reversedInteractions[i].interaction.answer.content,
    });
  }
  return messages;
};

async function invokeHandler(req, res) {
  if (req.method === 'POST') {
    try {
      console.log('Claude API request received');
      const { message, systemPrompt, conversationHistory } = req.body;
      console.log('Request body:', req.body);

      const claudeAgent = await createClaudeAgent();

      const messages = [
        {
          role: 'system',
          content: systemPrompt,
        },
        ...convertInteractionsToMessages(conversationHistory),
        {
          role: 'user',
          content: message,
        },
      ];

      let answer = await claudeAgent.invoke({
        messages: messages,
      });

      if (Array.isArray(answer.messages) && answer.messages.length > 0) {
        answer.messages.forEach((msg, index) => {
          console.log(`Claude Response [${index}]:`, {
            content: msg.content,
            classType: msg.constructor.name,
          });
        });
        const lastMessage = answer.messages[answer.messages.length - 1];
        res.json({
          content: lastMessage.content,
          inputTokens: lastMessage.response_metadata.usage.input_tokens,
          outputTokens: lastMessage.response_metadata.usage.output_tokens,
          model: lastMessage.response_metadata.model,
        });
      } else {
        throw new Error('Claude returned no messages');
      }
    } catch (error) {
      console.error('Error calling Claude API:', error.message);
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
      console.error(`Attempt ${attempt + 1} failed:`, error);

      if (attempt < NUM_RETRIES - 1) {
        const delay = Math.pow(2, attempt) * BASE_DELAY;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  console.error('All retry attempts failed');
  return res.status(500).json({
    error: 'Failed after retries',
    details: lastError?.message,
  });
}
