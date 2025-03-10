// config/ai-models.js
const AI_MODELS = {
  azure: {
    default: 'openai-gpt4o-mini',
    models: {
      'openai-gpt4o-mini': {
        maxTokens: 1024,
        temperature: 0.0,
        timeoutMs: 60000,
      }

    }
  },
  openai: {
    default: 'gpt-4o-2024-11-20',
    models: {
      'gpt-4o-2024-11-20': {
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

    }
  },
  anthropic: {
    default: 'claude-3-7-sonnet-latest',
    models: {
      'claude-3-7-sonnet-latest': {
        maxTokens: 1024,
        temperature: 0.0,
        knowledgeCutoff: '2024-04',
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

export default AI_MODELS;
