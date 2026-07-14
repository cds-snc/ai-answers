import { describe, it, expect, vi, beforeEach } from 'vitest';

const invokeWithStrategy = vi.fn();
const updateOne = vi.fn();
const logError = vi.fn();

vi.mock('../../agents/AgentOrchestratorService.js', () => ({
  default: { invokeWithStrategy: (...args) => invokeWithStrategy(...args) }
}));
vi.mock('../../agents/AgentFactory.js', () => ({
  createServiceActionAgent: vi.fn()
}));
vi.mock('mongoose', () => ({
  default: { model: vi.fn(() => ({ updateOne: (...args) => updateOne(...args) })) }
}));
vi.mock('../ServerLoggingService.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: (...args) => logError(...args) }
}));

const { default: ServiceActionClassificationService, UNKNOWN_VALUE } = await import(
  '../ServiceActionClassificationService.js'
);

const baseArgs = {
  contextId: 'ctx1',
  chatId: 'chat1',
  question: 'How do I apply for CPP?',
  answer: 'Apply online through...',
  department: 'EDSC-ESDC',
  citationUrl: 'https://www.canada.ca/x',
  referringUrl: ''
};

beforeEach(() => {
  invokeWithStrategy.mockReset();
  updateOne.mockReset();
  logError.mockReset();
  updateOne.mockResolvedValue({});
});

describe('classifyInteraction', () => {
  it('saves the classified service and a valid seed action to the Context doc', async () => {
    invokeWithStrategy.mockResolvedValue({ service: ' Canada Pension Plan ', action: 'Apply' });
    const result = await ServiceActionClassificationService.classifyInteraction(baseArgs);
    expect(result).toEqual({ service: 'Canada Pension Plan', action: 'Apply' });
    expect(updateOne).toHaveBeenCalledWith(
      { _id: 'ctx1' },
      { $set: { service: 'Canada Pension Plan', action: 'Apply' } }
    );
  });

  it('passes department seed services and the action list to the strategy', async () => {
    invokeWithStrategy.mockResolvedValue({ service: 'x', action: 'Apply' });
    await ServiceActionClassificationService.classifyInteraction(baseArgs);
    const request = invokeWithStrategy.mock.calls[0][0].request;
    expect(request.seedServices).toContain('Canada Pension Plan');
    expect(request.actions.length).toBeGreaterThan(0);
    expect(request.answer).toBe('Apply online through...');
  });

  it('coerces an off-list action to unknown and matches actions case-insensitively', async () => {
    invokeWithStrategy.mockResolvedValue({ service: 'Canada Pension Plan', action: 'Dance' });
    let result = await ServiceActionClassificationService.classifyInteraction(baseArgs);
    expect(result.action).toBe(UNKNOWN_VALUE);

    invokeWithStrategy.mockResolvedValue({ service: 'Canada Pension Plan', action: 'apply' });
    result = await ServiceActionClassificationService.classifyInteraction(baseArgs);
    expect(result.action).toBe('Apply');
  });

  it('coerces a missing, blank, or overlong service to unknown', async () => {
    invokeWithStrategy.mockResolvedValue({ service: '  ', action: 'Apply' });
    let result = await ServiceActionClassificationService.classifyInteraction(baseArgs);
    expect(result.service).toBe(UNKNOWN_VALUE);

    invokeWithStrategy.mockResolvedValue({ service: 'x'.repeat(200), action: 'Apply' });
    result = await ServiceActionClassificationService.classifyInteraction(baseArgs);
    expect(result.service).toBe(UNKNOWN_VALUE);
  });

  it('skips classification when there is no question text', async () => {
    const result = await ServiceActionClassificationService.classifyInteraction({
      ...baseArgs,
      question: ''
    });
    expect(result).toBeNull();
    expect(invokeWithStrategy).not.toHaveBeenCalled();
    expect(updateOne).not.toHaveBeenCalled();
  });

  it('throws when contextId is missing', async () => {
    await expect(
      ServiceActionClassificationService.classifyInteraction({ ...baseArgs, contextId: null })
    ).rejects.toThrow('contextId is required');
  });
});

describe('classifyInteractionInBackground', () => {
  it('never throws and logs when the classification fails', async () => {
    invokeWithStrategy.mockRejectedValue(new Error('LLM down'));
    expect(() =>
      ServiceActionClassificationService.classifyInteractionInBackground(baseArgs)
    ).not.toThrow();
    // flush the rejected promise chain
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(logError).toHaveBeenCalled();
    expect(updateOne).not.toHaveBeenCalled();
  });
});
