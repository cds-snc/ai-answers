import { createContextAgent } from '../agents/AgentFactory.js';

const invokeContextAgent = async (agentType, request) => {
  try {

    const { chatId, message, systemPrompt, searchResults, conversationHistory = [] } = request;
    const contextAgent = await createContextAgent(agentType, chatId);

    const messages = [
      {
        role: "system",
        content: `${systemPrompt}<searchResults>${searchResults}</searchResults>`,
      }
    ];

    // Add conversation history messages before the current message
    conversationHistory.forEach(entry => {
      messages.push({
        role: "user",
        content: entry.interaction.question
      });
      messages.push({
        role: "assistant",
        content: entry.interaction.answer.content
      });
    });

    // Add the current message
    messages.push({
      role: "user",
      content: message,
    });

    const answer = await contextAgent.invoke({
      messages: messages,
    });

    if (Array.isArray(answer.messages) && answer.messages.length > 0) {
      const lastResult = answer.messages[answer.messages.length - 1];
      const lastMessage = lastResult.content;
      console.log('ContextAgent Response:', {
        content: lastMessage,
        role: answer.messages[answer.messages.length - 1]?.response_metadata.role,
        usage: answer.messages[answer.messages.length - 1]?.response_metadata.usage,
      });
      return {
        message: lastMessage,
        inputTokens: lastResult.response_metadata.tokenUsage?.promptTokens,
        outputTokens: lastResult.response_metadata.tokenUsage?.completionTokens,
        model: lastResult.response_metadata.model_name,
        searchProvider: request.searchProvider,
        searchResults: request.searchResults
      }
    } else {
      return "No messages available";
    }
  } catch (error) {
    console.error(`Error with ${agentType} agent:`, error);
    throw error;
  }
};

export { invokeContextAgent };