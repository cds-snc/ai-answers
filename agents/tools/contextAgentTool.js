import { tool } from "@langchain/core/tools";
import { invokeContextAgent } from "../../services/ContextAgentService.js";
import loadContextSystemPrompt from "../../src/services/contextSystemPrompt.js";
import { contextSearch as googleSearch } from "./googleContextSearch.js";
import { contextSearch as canadaSearch } from "./canadaCaContextSearch.js";

/**
 * Factory to create a context agent tool for a specific provider. The tool
 * performs a search based on the question and returns the generated context
 * string from the context agent.
 */
const createContextAgentTool = (agentType = 'openai') =>
  tool(
    async ({ question, lang = 'en', searchProvider = 'google', chatId = 'system' }) => {
      const systemPrompt = await loadContextSystemPrompt(lang);

      const searchFn = searchProvider.toLowerCase() === 'canadaca'
        ? canadaSearch
        : googleSearch;
      const searchResults = await searchFn(question, lang);

      const context = await invokeContextAgent(agentType, {
        chatId,
        message: question,
        systemPrompt,
        searchResults,
        conversationHistory: [],
        searchProvider,
      });
      return context.message;
    },
    {
      name: 'generateContext',
      description:
        'Perform a search for the question and generate contextual information.',
      schema: {
        type: 'object',
        properties: {
          question: { type: 'string', description: 'User question to analyse' },
          lang: { type: 'string', description: 'Language of the question' },
          searchProvider: {
            type: 'string',
            description: 'Search provider to use (google or canadaca)',
          },
        },
        required: ['question'],
      },
    }
  );

export default createContextAgentTool;
