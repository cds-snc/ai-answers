// config/ai-models.js
const AI_MODELS = {
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
      },
    },
  },
  anthropic: {
    default: 'claude-3-5-sonnet-20241022',
    models: {
      'claude-3-5-sonnet-20241022': {
        maxTokens: 1024,
        temperature: 0.0,
        knowledgeCutoff: '2024-04',
        beta: {
          promptCaching: 'prompt-caching-2024-07-31',
          messageBatches: 'message-batches-2024-09-24',
        },
      },
      'claude-3-5-haiku-20241022': {
        maxTokens: 8192,
        temperature: 0.0,
        timeoutMs: 60000,
        beta: {
          promptCaching: 'prompt-caching-2024-07-31',
          messageBatches: 'message-batches-2024-09-24',
        },
      },
    },
  },
  //TODO: When cohere is working on Vercel, implement via this config file
  //   cohere: {
  //     default: 'command-r-plus-08-2024',
  //     models: {
  //       'command-r-plus-08-2024': {
  //         maxTokens: 1024,
  //         temperature: 0.5,
  //         knowledgeCutoff: '2024-08'
  //       },
  //       'command-r-plus': {
  //         maxTokens: 1024,
  //         temperature: 0.5,
  //         knowledgeCutoff: '2024-05'
  //       }
  //     }
  //   }
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
    ...modelConfig,
  };
};

export default AI_MODELS;
