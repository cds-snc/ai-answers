import { createContextAgent } from '../agents/AgentFactory.js';
import loadContextSystemPrompt from '../agents/prompts/contextSystemPrompt.js';
import { referringUrlTag } from '../api/util/prompt-tags.js';

const invokeContextAgent = async (agentType, request) => {
  try {

    let { chatId, message, systemPrompt, searchResults, conversationHistory = [], language = 'en', referringUrl = '' } = request;

    // Load system prompt from contextSystemPrompt.js if not provided
    if (!systemPrompt) {
      systemPrompt = await loadContextSystemPrompt(language);
    }

    const contextAgent = await createContextAgent(agentType, chatId);

    const messages = [
      {
        role: "system",
        content: `${systemPrompt}<searchResults>${searchResults}</searchResults>`,
      }
    ];

    // Add conversation history messages before the current message.
    // TODO(ai-turn-check-sync): this "is this an AI turn" guard is
    // hand-duplicated in 2 other files - AnswerGenerationService.js and
    // ConversationIntegrityService.js's serializeHistory (search for
    // "isUser" there). All three independently implement the same
    // invariant (originally by the same author, Ryan Hyma, both written in
    // commit b585a348 - a real bug-fix after a conversation-integrity hash
    // mismatch caused by this file and ConversationIntegrityService.js
    // drifting apart). Keep this in sync with the other two if you touch
    // it - consider a shared helper only if that becomes a recurring cost.
    //
    // Only process AI-turn entries (the ones carrying the full Q&A pair in
    // `interaction`) to avoid duplicates - a client message array pushes
    // one entry per bubble (user + AI) per turn, and a user-sender entry
    // must never contribute its own pair here too. The explicit
    // `sender === 'user'` check is defense-in-depth on top of the
    // `!entry.interaction` check below: a user-sender entry should never
    // carry `.interaction` in the first place (src/components/chat/
    // ChatAppContainer.js gives it a plain `questionLanguage` string
    // instead), but this file has no way to enforce that from the client
    // side, and the one time that contract was silently broken (a user
    // bubble briefly carried the same `.interaction` object as its paired
    // AI bubble), every historical turn got pushed here twice with no
    // error or warning.
    conversationHistory.forEach(entry => {
      if (entry.sender === 'user' || !entry.interaction) return;

      messages.push({
        role: "user",
        content: entry.interaction.question
      });
      messages.push({
        role: "assistant",
        content: entry.interaction.answer.content
      });
    });

    // Add the current message, tagged with the referring URL the user launched from.
    // contextSystemPrompt.js instructs the agent to prioritize <referring-url> over
    // <searchResults> when matching a department, so the tag has to reach the model.
    messages.push({
      role: "user",
      content: `${message}${referringUrlTag(referringUrl)}`,
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