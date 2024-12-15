import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { ChatOpenAI } from '@langchain/openai';
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatCohere } from '@langchain/cohere';
import downloadWebPageTool from './tools/downloadWebPage.js';
import checkUrlStatusTool from './tools/checkURL.js';
import canadaCASearch from './tools/canadaCaSearch.js';
import contextSearchTool from './tools/contextSearch.js';
import { getModelConfig } from '../config/ai-models.js';
import dotenv from 'dotenv';

dotenv.config();

const tools = [downloadWebPageTool, checkUrlStatusTool]; // Use the imported tools

const createOpenAIAgent = async () => {
  const modelConfig = getModelConfig('openai');
  const openai = new ChatOpenAI({
    modelName: modelConfig.name,
    apiKey: process.env.REACT_APP_OPENAI_API_KEY,
    temperature: modelConfig.temperature,
    maxTokens: modelConfig.maxTokens,
    timeoutMs: modelConfig.timeoutMs,
  });
  const agent = await createReactAgent({
    llm: openai,
    tools: tools,
  });
  return agent;
};

const createCohereAgent = async () => {
  const modelConfig = getModelConfig('cohere');
  const cohere = new ChatCohere({
    apiKey: process.env.REACT_APP_COHERE_API_KEY,
    model: modelConfig.name,
    temperature: modelConfig.temperature,
    maxTokens: modelConfig.maxTokens,
  });
  const agent = await createReactAgent({
    llm: cohere,
    tools: tools,
  });
  return agent;
};

const createClaudeAgent = async () => {
  const modelConfig = getModelConfig('anthropic');
  const claude = new ChatAnthropic({
    apiKey: process.env.REACT_APP_ANTHROPIC_API_KEY,
    modelName: modelConfig.name,
    temperature: modelConfig.temperature,
    maxTokens: modelConfig.maxTokens,
    beta: modelConfig.beta,
  });
  const agent = await createReactAgent({
    llm: claude,
    tools: tools,
  });
  return agent;
};

const createContextAgent = async () => {
  const tools = [contextSearchTool]; 
  const haiku = new ChatAnthropic({
    apiKey: process.env.REACT_APP_ANTHROPIC_API_KEY,
    modelName: "claude-3-5-haiku-20241022",
  });
  const agent = await createReactAgent({
    llm: haiku,
    tools: tools,
  });
  return agent;
};

const createAgents = async () => {
  const openAIAgent = await createOpenAIAgent();
  const cohereAgent = null; //await createCohereAgent();
  const claudeAgent = await createClaudeAgent();
  const contextAgent = await createContextAgent();
  return { openAIAgent, cohereAgent, claudeAgent, contextAgent };
};

const getAgent = (agents, selectedAgent) => {
  switch (selectedAgent) {
    case 'openai':
      return agents.openAIAgent;
    case 'cohere':
      return agents.cohereAgent;
    case 'claude':
      return agents.claudeAgent;
    case 'context':
      return agents.contextAgent;
    default:
      throw new Error('Invalid agent specified');
  }
};

export { createAgents, getAgent, createContextAgent, createClaudeAgent, createCohereAgent, createOpenAIAgent };