 // config/ai-models.js
const AI_MODELS = {  
  azure: {
    default: "openai-gpt41",
    models: {
      "openai-gpt41-mini": { 
        maxTokens: 1024,
        temperature: 0.0,
        timeoutMs: 60000,
      },
       "openai-gpt41": { 
        maxTokens: 1024,
        temperature: 0.0,
        timeoutMs: 60000,
      },
      "gpt-4o": {
        maxTokens: 1024,
        temperature: 0.0,
        timeoutMs: 60000,
      },
      "openai-gpt4o-mini": {
        maxTokens: 1024,
        temperature: 0.0,
        timeoutMs: 60000,
      },
    },
    embeddings: {
      default: 'text-embedding-3-large',
      models: {
        'text-embedding-3-large': {
          dimensions: 2000,
          timeoutMs: 30000,
        },
        'text-embedding-3-small': {
          dimensions: 1536,
          timeoutMs: 30000,
        },
        'text-embedding-ada-002': {
          dimensions: 1536,
          timeoutMs: 30000,
        }
      }
    }
  },
  openai: {
    default: 'gpt-4.1-2025-04-14',
    models: {
      'gpt-4.1-mini': { 
        maxTokens: 1024,
        temperature: 0.0,
        timeoutMs: 60000,
      },
      'gpt-4.1-2025-04-14': {
        maxTokens: 1024,
        temperature: 0.0,
        timeoutMs: 60000,
      },
      'gpt-4o': {
        maxTokens: 1024,
        temperature: 0.0,
        timeoutMs: 60000,
      },
      'gpt-4o-mini': {
        maxTokens: 1024,
        temperature: 0.0,
        timeoutMs: 60000,
      }

    },
    embeddings: {
      default: 'text-embedding-3-large',
      models: {
        'text-embedding-3-large': {
          dimensions: 2000,
          timeoutMs: 30000,
        },
        'text-embedding-3-small': {
          dimensions: 1536,
          timeoutMs: 30000,
        },
        'text-embedding-ada-002': {
          dimensions: 1536,
          timeoutMs: 30000,
        }
      }
    }
  },
  anthropic: {
    default: 'claude-3-7-sonnet-latest',
    models: {
      'claude-3-7-sonnet-latest': {
        maxTokens: 1024,
        temperature: 0.0,
        beta: {
          messageBatches: 'message-batches-2024-09-24'
        }
      },
      'claude-3-5-haiku-20241022': {
        maxTokens: 8192,
        temperature: 0.0,
        timeoutMs: 60000,
        beta: {
          promptCaching: 'prompt-caching-2024-07-31',
          messageBatches: 'message-batches-2024-09-24'
        },
      }
    }
  },

};

export const getModelConfig = (provider, modelName = null) => {
  const providerConfig = AI_MODELS[provider];
  if (!providerConfig) {
    throw new Error(`Unknown AI provider: ${provider}`);
  }

  const selectedModel = modelName || providerConfig.default;
  const modelConfig = providerConfig.models[selectedModel];

  if (!modelConfig) {
    throw new Error(`Unknown model ${selectedModel} for provider ${provider}`);
  }

  return {
    name: selectedModel,
    ...modelConfig
  };
};

// Add the getEmbeddingModelConfig function
export const getEmbeddingModelConfig = (provider, modelName = null) => {
  const providerConfig = AI_MODELS[provider];
  if (!providerConfig || !providerConfig.embeddings) {
    throw new Error(`No embedding models found for provider: ${provider}`);
  }

  const selectedModel = modelName || providerConfig.embeddings.default;
  const modelConfig = providerConfig.embeddings.models[selectedModel];

  if (!modelConfig) {
    throw new Error(`Unknown embedding model ${selectedModel} for provider ${provider}`);
  }

  return {
    name: selectedModel,
    ...modelConfig
  };
};

export default AI_MODELS;
