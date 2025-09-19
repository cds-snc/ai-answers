import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';

const createSentenceCompareAgent = vi.fn();
const createFallbackCompareAgent = vi.fn();

vi.mock('../../agents/AgentFactory.js', () => ({
  createSentenceCompareAgent,
  createFallbackCompareAgent,
}));

const orchestratorMock = { invokeWithStrategy: vi.fn() };
vi.mock('../../agents/AgentOrchestratorService.js', () => ({
  AgentOrchestratorService: orchestratorMock,
  default: orchestratorMock,
}));

vi.mock('../ServerLoggingService.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

let runFallbackCompareCheck;

beforeAll(async () => {
  const mod = await import('../evaluation.worker.js');
  runFallbackCompareCheck = mod.runFallbackCompareCheck;
});

beforeEach(() => {
  vi.clearAllMocks();
  createFallbackCompareAgent.mockResolvedValue({});
});

describe('runFallbackCompareCheck', () => {
  it('invokes fallback compare agent with question flow context and returns telemetry', async () => {
    const agentResponse = {
      parsed: {
        numbers: { p: 'p' },
        entities: { p: 'p' },
      },
      raw: { step: 1 },
      model: 'gpt-4.1-mini',
      inputTokens: 12,
      outputTokens: 6,
    };

    orchestratorMock.invokeWithStrategy.mockImplementation(async (options) => {
      expect(options.request.source).toBe('Question Flow:\nQuestion 1: Source question?\n\nAnswer:\nSentence one. Sentence two.');
      expect(options.request.candidate).toBe('Question Flow:\nQuestion 1: Candidate question?\n\nAnswer:\nFallback matches. Fallback continues.');
      await options.createAgentFn('openai', 'fallback-compare');
      return agentResponse;
    });

    const sourceInteraction = {
      answer: {
        sentences: ['Sentence one.', 'Sentence two.'],
      },
    };
    const fallbackInteraction = {
      answer: {
        sentences: ['Fallback matches.', 'Fallback continues.'],
      },
    };

    const result = await runFallbackCompareCheck({
      sourceInteraction,
      fallbackInteraction,
      sourceQuestionFlow: 'Question 1: Source question?',
      fallbackQuestionFlow: 'Question 1: Candidate question?',
      aiProvider: 'openai',
    });

    expect(orchestratorMock.invokeWithStrategy).toHaveBeenCalledTimes(1);
    expect(createFallbackCompareAgent).toHaveBeenCalledWith('openai', 'fallback-compare', 5000);

    expect(result.performed).toBe(true);
    expect(result.sourceQuestionFlow).toBe('Question 1: Source question?');
    expect(result.fallbackQuestionFlow).toBe('Question 1: Candidate question?');
    expect(result.checks).toEqual(agentResponse.parsed);
    expect(result.raw).toEqual(agentResponse.raw);
    expect(result.meta).toMatchObject({
      provider: 'openai',
      model: 'gpt-4.1-mini',
      inputTokens: 12,
      outputTokens: 6,
    });
    expect(result.meta.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('skips invocation when answer text is missing', async () => {
    const sourceInteraction = {
      answer: {
        sentences: [],
      },
    };
    const fallbackInteraction = {
      answer: {
        sentences: [],
      },
    };

    const result = await runFallbackCompareCheck({
      sourceInteraction,
      fallbackInteraction,
      sourceQuestionFlow: '',
      fallbackQuestionFlow: '',
      aiProvider: 'openai',
    });

    expect(orchestratorMock.invokeWithStrategy).not.toHaveBeenCalled();
    expect(createFallbackCompareAgent).not.toHaveBeenCalled();
    expect(result.performed).toBe(false);
    expect(result.checks).toBeNull();
    expect(result.raw).toBeNull();
    expect(result.meta).toBeNull();
  });
});
