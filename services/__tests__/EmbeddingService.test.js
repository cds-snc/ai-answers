import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const openaiEmbeddingsCtor = vi.fn();
const azureEmbeddingsCtor = vi.fn();

vi.mock('@langchain/openai', () => ({
  OpenAIEmbeddings: vi.fn(function OpenAIEmbeddings(opts) {
    openaiEmbeddingsCtor(opts);
    return { provider: 'openai', opts };
  }),
  AzureOpenAIEmbeddings: vi.fn(function AzureOpenAIEmbeddings(opts) {
    azureEmbeddingsCtor(opts);
    return { provider: 'azure', opts };
  }),
}));

vi.mock('../ServerLoggingService.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import EmbeddingService from '../EmbeddingService.js';

describe('EmbeddingService', () => {
  beforeEach(() => {
    openaiEmbeddingsCtor.mockClear();
    azureEmbeddingsCtor.mockClear();
    process.env.OPENAI_API_KEY = 'test-openai-key';
    process.env.AZURE_OPENAI_API_KEY = 'test-azure-key';
    process.env.AZURE_OPENAI_ENDPOINT = 'https://example.openai.azure.com/';
  });

  afterEach(() => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.AZURE_OPENAI_API_KEY;
    delete process.env.AZURE_OPENAI_ENDPOINT;
  });

  it('normalizes virtual GPT providers to the Azure embeddings client', () => {
    const client = EmbeddingService.createEmbeddingClient('openai-gpt51');

    expect(client.provider).toBe('azure');
    expect(azureEmbeddingsCtor).toHaveBeenCalledTimes(1);
    expect(openaiEmbeddingsCtor).not.toHaveBeenCalled();
  });

  it('keeps plain openai provider on the OpenAI embeddings client', () => {
    const client = EmbeddingService.createEmbeddingClient('openai');

    expect(client.provider).toBe('openai');
    expect(openaiEmbeddingsCtor).toHaveBeenCalledTimes(1);
    expect(azureEmbeddingsCtor).not.toHaveBeenCalled();
  });
});
