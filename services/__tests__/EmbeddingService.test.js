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

  it('builds canonical question/flow/qa embedding texts from shared methods', () => {
    const question = EmbeddingService.buildQuestionEmbeddingText('What is EI?', 2);
    const flow = EmbeddingService.buildQuestionsEmbeddingText(['First', 'Second']);
    const qa = EmbeddingService.buildQuestionsAnswerEmbeddingText(['First', 'Second'], 'Here is the answer');
    const all = EmbeddingService.buildAllEmbeddingTexts({
      previousQuestions: ['First'],
      currentQuestion: 'Second',
      answer: 'Here is the answer',
      sentences: ['Sentence one.'],
    });

    expect(question).toBe('Question 2: What is EI?');
    expect(flow).toBe('Question 1: First\nQuestion 2: Second');
    expect(qa).toBe('Question 1: First\nQuestion 2: Second\nAnswer 2: Here is the answer');
    expect(all.questionEmbeddingText).toBe('Question 2: Second');
    expect(all.questionsEmbeddingText).toBe('Question 1: First\nQuestion 2: Second');
    expect(all.answerEmbeddingText).toBe('Answer 2: Here is the answer');
    expect(all.questionsAnswerEmbeddingText).toBe('Question 1: First\nQuestion 2: Second\nAnswer 2: Here is the answer');
    expect(all.sentenceEmbeddingTexts).toEqual(['Sentence 1: Sentence one.']);
    expect(all.textsToEmbed.length).toBe(5);
  });
});
