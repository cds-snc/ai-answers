import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { ChatOpenAI, AzureChatOpenAI } from '@langchain/openai';
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatCohere } from '@langchain/cohere';
import OpenAI from 'openai';
import downloadWebPageTool from './tools/downloadWebPage.js';
import checkUrlStatusTool from './tools/checkURL.js';
import createContextAgentTool from './tools/contextAgentTool.js';
import { ToolTrackingHandler } from './ToolTrackingHandler.js';
import { getModelConfig } from '../config/ai-models.js';
import dotenv from 'dotenv';

dotenv.config();

const createTools = (chatId = 'system', agentType = 'openai') => {
  const callbacks = [new ToolTrackingHandler(chatId)];

  // Wrap tools with callbacks to ensure consistent tracking
  const wrapToolWithCallbacks = (tool) => ({
    ...tool,
    invoke: async (params) => {
      return tool.invoke({
        ...params,
        args: {
          ...params.args,
          chatId
        }
      }, { callbacks });
    }
  });

  const contextTool = createContextAgentTool(agentType);

  return {
    tools: [
      wrapToolWithCallbacks(downloadWebPageTool),
      wrapToolWithCallbacks(checkUrlStatusTool),
      wrapToolWithCallbacks(contextTool),

    ],
    callbacks
  };
};

const createAzureOpenAIAgent = async (chatId = 'system') => {
  const modelConfig = getModelConfig('azure');
  const openai = new AzureChatOpenAI({
    azureApiKey: process.env.AZURE_OPENAI_API_KEY,
    azureEndpoint: process.env.AZURE_OPENAI_ENDPOINT,
    apiVersion: process.env.AZURE_OPENAI_API_VERSION || '2024-06-01',
    azureOpenAIApiDeploymentName: modelConfig.name,
    temperature: modelConfig.temperature,
    maxTokens: modelConfig.maxTokens,
    timeout: modelConfig.timeoutMs,
  });

  const { tools, callbacks } = createTools(chatId, 'azure');
  const agent = await createReactAgent({
    llm: openai, tools,
    agentConfig: {
      handleParsingErrors: true,
      maxIterations: 25,
      returnIntermediateSteps: true,
      parallel_tool_calls: false
    }
  });
  agent.callbacks = callbacks;
  return agent;
};

const createOpenAIAgent = async (chatId = 'system') => {
  const modelConfig = getModelConfig('openai');
  const openai = new ChatOpenAI({
    openAIApiKey: process.env.OPENAI_API_KEY,
    modelName: modelConfig.name,
    temperature: modelConfig.temperature,
    maxTokens: modelConfig.maxTokens,
    timeout: modelConfig.timeoutMs,

  });

  const { tools, callbacks } = createTools(chatId, 'openai');


  const agent = await createReactAgent({
    llm: openai,
    tools,
    agentConfig: {
      handleParsingErrors: true,
      maxIterations: 25,
      returnIntermediateSteps: true,
      parallel_tool_calls: false
    }
  });
  agent.callbacks = callbacks;
  console.log('Creating OpenAI context agent with model:', modelConfig.name);
  return agent;
};

const createCohereAgent = async (chatId = 'system') => {
  const modelConfig = getModelConfig('cohere');
  const cohere = new ChatCohere({
    apiKey: process.env.REACT_APP_COHERE_API_KEY,
    model: modelConfig.name,
    temperature: modelConfig.temperature,
    maxTokens: modelConfig.maxTokens,
  });

  const { tools, callbacks } = createTools(chatId, 'cohere');
  const agent = await createReactAgent({ llm: cohere, tools });
  agent.callbacks = callbacks;
  return agent;
};

const createClaudeAgent = async (chatId = 'system') => {
  const modelConfig = getModelConfig('anthropic');
  const claude = new ChatAnthropic({
    apiKey: process.env.REACT_APP_ANTHROPIC_API_KEY,
    modelName: modelConfig.name,
    temperature: modelConfig.temperature,
    maxTokens: modelConfig.maxTokens,
    beta: modelConfig.beta,
  });

  const { tools, callbacks } = createTools(chatId, 'anthropic');
  const agent = await createReactAgent({ llm: claude, tools });
  agent.callbacks = callbacks;
  return agent;
};


const createContextAgent = async (agentType, chatId = 'system') => {
  let llm;
  switch (agentType) {
    case 'openai': {
      const openaiConfig = getModelConfig('openai');
      llm = new ChatOpenAI({
        openAIApiKey: process.env.OPENAI_API_KEY,
        modelName: openaiConfig.name,
        temperature: openaiConfig.temperature,
        maxTokens: openaiConfig.maxTokens,
        timeout: openaiConfig.timeoutMs,
      });
      break;
    }
    case 'azure': {
      const azureConfig = getModelConfig('azure');
      llm = new AzureChatOpenAI({
        azureApiKey: process.env.AZURE_OPENAI_API_KEY,
        azureEndpoint: process.env.AZURE_OPENAI_ENDPOINT,
        apiVersion: process.env.AZURE_OPENAI_API_VERSION || '2024-06-01',
        azureOpenAIApiDeploymentName: azureConfig.name,
        temperature: azureConfig.temperature,
        maxTokens: azureConfig.maxTokens,
        timeout: azureConfig.timeoutMs,
      });
      console.log('Creating Azure OpenAI context agent with model:', azureConfig.name);
      break;
    }
    case 'cohere': {
      llm = new CohereClient({
        apiKey: process.env.COHERE_API_KEY,
        modelName: 'command-xlarge-nightly',
        maxTokens: 4096,
        temperature: 0,
        timeoutMs: 60000,
      });
      break;
    }
    case 'anthropic': {
      llm = new ChatAnthropic({
        apiKey: process.env.ANTHROPIC_API_KEY,
        modelName: 'claude-3-5-haiku-20241022',
        maxTokens: 8192,
        temperature: 0,
        timeoutMs: 60000,
      });
      break;
    }
    default:
      throw new Error(`Unknown agent type: ${agentType}`);
  }
  // Context agent doesn't need tools, just callbacks for tracking
  const callbacks = [new ToolTrackingHandler(chatId)];
  const agent = await createReactAgent({ llm, tools: [] });
  agent.callbacks = callbacks;
  return agent;
};


const createQueryAndPIIAgent = async (agentType, chatId = 'system') => {
  let llm;
  switch (agentType) {
    case 'openai': {
      const openaiConfig = getModelConfig('openai', 'gpt-4.1-mini');
      llm = new ChatOpenAI({
        openAIApiKey: process.env.OPENAI_API_KEY,
        modelName: openaiConfig.name,
        temperature: openaiConfig.temperature,
        maxTokens: openaiConfig.maxTokens,
        timeout: openaiConfig.timeoutMs,
      });
      break;
    }
    case 'azure': {
      const azureConfig = getModelConfig('azure', 'openai-gpt41-mini');
      llm = new AzureChatOpenAI({
        azureApiKey: process.env.AZURE_OPENAI_API_KEY,
        azureEndpoint: process.env.AZURE_OPENAI_ENDPOINT,
        apiVersion: process.env.AZURE_OPENAI_API_VERSION || '2024-06-01',
        azureOpenAIApiDeploymentName: azureConfig.name,
        temperature: azureConfig.temperature,
        maxTokens: azureConfig.maxTokens,
        timeout: azureConfig.timeoutMs,
      });
      console.log('Creating Azure OpenAI search agent with model:', azureConfig.name);
      break;
    }
    default:
      throw new Error(`Unknown agent type for search: ${agentType}`);
  }
  // Search agent doesn't need tools, just callbacks for tracking
  const callbacks = [new ToolTrackingHandler(chatId)];
  const agent = await createReactAgent({ llm, tools: [] });
  agent.callbacks = callbacks;
  return agent;
};


const createPIIAgent = async (agentType, chatId = 'system') => {
  let llm;
  switch (agentType) {
    case 'openai': {
      const openaiConfig = getModelConfig('openai', 'gpt-4.1-mini');
      llm = new ChatOpenAI({
        openAIApiKey: process.env.OPENAI_API_KEY,
        modelName: openaiConfig.name,
        temperature: openaiConfig.temperature,
        maxTokens: openaiConfig.maxTokens,
        timeout: openaiConfig.timeoutMs,
      });
      break;
    }
    case 'azure': {
      const azureConfig = getModelConfig('azure', 'openai-gpt41-mini');
      llm = new AzureChatOpenAI({
        azureApiKey: process.env.AZURE_OPENAI_API_KEY,
        azureEndpoint: process.env.AZURE_OPENAI_ENDPOINT,
        apiVersion: process.env.AZURE_OPENAI_API_VERSION || '2024-06-01',
        azureOpenAIApiDeploymentName: azureConfig.name,
        temperature: azureConfig.temperature,
        maxTokens: azureConfig.maxTokens,
        timeout: azureConfig.timeoutMs,
      });
      break;
    }
    default:
      throw new Error(`Unknown agent type for PII: ${agentType}`);
  }
  
  return llm;
};

const createQueryRewriteAgent = async (agentType, chatId = 'system') => {
  let llm;
  switch (agentType) {
    case 'openai': {
      const openaiConfig = getModelConfig('openai', 'gpt-4.1-mini');
      llm = new ChatOpenAI({
        openAIApiKey: process.env.OPENAI_API_KEY,
        modelName: openaiConfig.name,
        temperature: openaiConfig.temperature,
        maxTokens: openaiConfig.maxTokens,
        timeout: openaiConfig.timeoutMs,
      });
      break;
    }
    case 'azure': {
      const azureConfig = getModelConfig('azure', 'openai-gpt41-mini');
      llm = new AzureChatOpenAI({
        azureApiKey: process.env.AZURE_OPENAI_API_KEY,
        azureEndpoint: process.env.AZURE_OPENAI_ENDPOINT,
        apiVersion: process.env.AZURE_OPENAI_API_VERSION || '2024-06-01',
        azureOpenAIApiDeploymentName: azureConfig.name,
        temperature: azureConfig.temperature,
        maxTokens: azureConfig.maxTokens,
        timeout: azureConfig.timeoutMs,
      });
      break;
    }
    default:
      throw new Error(`Unknown agent type for rewrite: ${agentType}`);
  }
  
  return llm;
};

// Ranker agent: LLM-only agent that uses the reranker prompt. Supports 'openai' and 'azure'.
const createRankerAgent = async (agentType = 'openai', chatId = 'system') => {
  let llm;
  switch (agentType) {
    case 'openai': {
      // Use the smaller 4.1-mini model for ranking to reduce latency/cost
      const cfg = getModelConfig('openai', 'gpt-4.1-mini');
      llm = new ChatOpenAI({
        openAIApiKey: process.env.OPENAI_API_KEY,
        modelName: cfg.name,
        temperature: cfg.temperature,
        maxTokens: cfg.maxTokens,
        timeout: cfg.timeoutMs,
      });
      break;
    }
    case 'azure': {
      // Use the Azure deployment mapped to the mini variant when available
      const cfg = getModelConfig('azure', 'openai-gpt41-mini');
      llm = new AzureChatOpenAI({
        azureApiKey: process.env.AZURE_OPENAI_API_KEY,
        azureEndpoint: process.env.AZURE_OPENAI_ENDPOINT,
        apiVersion: process.env.AZURE_OPENAI_API_VERSION || '2024-06-01',
        azureOpenAIApiDeploymentName: cfg.name,
        temperature: cfg.temperature,
        maxTokens: cfg.maxTokens,
        timeout: cfg.timeoutMs,
      });
      break;
    }
    default:
      throw new Error(`Unknown agent type for ranker: ${agentType}`);
  }


  return llm;
};

// Translation agent: LLM-only agent that uses the translation prompt. Supports 'openai' and 'azure'.
const createTranslationAgent = async (agentType = 'openai', chatId = 'system') => {
  let llm;
  switch (agentType) {
    case 'openai': {
      // Use a compact model for translations to reduce latency/cost
      const cfg = getModelConfig('openai', 'gpt-4.1-mini');
      llm = new ChatOpenAI({
        openAIApiKey: process.env.OPENAI_API_KEY,
        modelName: cfg.name,
        temperature: 0,
        maxTokens: cfg.maxTokens,
        timeout: cfg.timeoutMs,
      });
      break;
    }
    case 'azure': {
      const cfg = getModelConfig('azure', 'openai-gpt41-mini');
      llm = new AzureChatOpenAI({
        azureApiKey: process.env.AZURE_OPENAI_API_KEY,
        azureEndpoint: process.env.AZURE_OPENAI_ENDPOINT,
        apiVersion: process.env.AZURE_OPENAI_API_VERSION || '2024-06-01',
        azureOpenAIApiDeploymentName: cfg.name,
        temperature: 0,
        maxTokens: cfg.maxTokens,
        timeout: cfg.timeoutMs,
      });
      break;
    }
    default:
      throw new Error(`Unknown agent type for translation: ${agentType}`);
  }

  // Return the llm so callers can build messages using the translation prompt/strategy
  return llm;
};

// Sentence-compare agent: LLM-only agent that compares a single source sentence to up to 10
// candidate sentences using the sentenceCompare prompt/strategy. Supports 'openai' and 'azure'.
const createSentenceCompareAgent = async (agentType = 'openai', chatId = 'system', maxTokens = undefined) => {
  let llm;
  switch (agentType) {
    case 'openai': {
      const cfg = getModelConfig('openai', 'gpt-4.1-mini');
      llm = new ChatOpenAI({
        openAIApiKey: process.env.OPENAI_API_KEY,
        modelName: cfg.name,
        temperature: cfg.temperature,
        maxTokens: maxTokens ?? cfg.maxTokens,
        timeout: cfg.timeoutMs,
      });
      break;
    }
    case 'azure': {
      const cfg = getModelConfig('azure', 'openai-gpt41-mini');
      llm = new AzureChatOpenAI({
        azureApiKey: process.env.AZURE_OPENAI_API_KEY,
        azureEndpoint: process.env.AZURE_OPENAI_ENDPOINT,
        apiVersion: process.env.AZURE_OPENAI_API_VERSION || '2024-06-01',
        azureOpenAIApiDeploymentName: cfg.name,
        temperature: cfg.temperature,
        maxTokens: maxTokens ?? cfg.maxTokens,
        timeout: cfg.timeoutMs,
      });
      break;
    }
    default:
      throw new Error(`Unknown agent type for sentence-compare: ${agentType}`);
  }

  return llm;
};

// Fallback-compare agent: LLM-only agent that compares a single source sentence to a single
// high-score fallback candidate. Supports 'openai' and 'azure'.
const createFallbackCompareAgent = async (agentType = 'openai', chatId = 'system', maxTokens = undefined) => {
  let llm;
  switch (agentType) {
    case 'openai': {
      const cfg = getModelConfig('openai', 'gpt-4.1-mini');
      llm = new ChatOpenAI({
        openAIApiKey: process.env.OPENAI_API_KEY,
        modelName: cfg.name,
        temperature: cfg.temperature,
        maxTokens: maxTokens ?? cfg.maxTokens,
        timeout: cfg.timeoutMs,
      });
      break;
    }
    case 'azure': {
      const cfg = getModelConfig('azure', 'openai-gpt41-mini');
      llm = new AzureChatOpenAI({
        azureApiKey: process.env.AZURE_OPENAI_API_KEY,
        azureEndpoint: process.env.AZURE_OPENAI_ENDPOINT,
        apiVersion: process.env.AZURE_OPENAI_API_VERSION || '2024-06-01',
        azureOpenAIApiDeploymentName: cfg.name,
        temperature: cfg.temperature,
        maxTokens: maxTokens ?? cfg.maxTokens,
        timeout: cfg.timeoutMs,
      });
      break;
    }
    default:
      throw new Error(`Unknown agent type for fallback-compare: ${agentType}`);
  }

  return llm;
};

// Detect-language agent: LLM-only agent that uses the detectLanguage prompt/strategy.
// Returns an LLM configured for low-latency deterministic responses.
const createDetectLanguageAgent = async (agentType = 'openai', chatId = 'system') => {
  let llm;
  switch (agentType) {
    case 'openai': {
      // Use a compact model and deterministic settings
      const cfg = getModelConfig('openai', 'gpt-4.1-mini');
      llm = new ChatOpenAI({
        openAIApiKey: process.env.OPENAI_API_KEY,
        modelName: cfg.name,
        temperature: 0,
        maxTokens: cfg.maxTokens,
        timeout: cfg.timeoutMs,
      });
      break;
    }
    case 'azure': {
      const cfg = getModelConfig('azure', 'openai-gpt41-mini');
      llm = new AzureChatOpenAI({
        azureApiKey: process.env.AZURE_OPENAI_API_KEY,
        azureEndpoint: process.env.AZURE_OPENAI_ENDPOINT,
        apiVersion: process.env.AZURE_OPENAI_API_VERSION || '2024-06-01',
        azureOpenAIApiDeploymentName: cfg.name,
        temperature: 0,
        maxTokens: cfg.maxTokens,
        timeout: cfg.timeoutMs,
      });
      break;
    }
    default:
      throw new Error(`Unknown agent type for detect-language: ${agentType}`);
  }

  // Return the llm so callers can build messages using the detectLanguage prompt/strategy
  return llm;
};

export { createClaudeAgent, createCohereAgent, createOpenAIAgent, createAzureOpenAIAgent, createContextAgent, createQueryAndPIIAgent, createPIIAgent, createQueryRewriteAgent, createRankerAgent, createTranslationAgent, createDetectLanguageAgent, createSentenceCompareAgent, createFallbackCompareAgent };


