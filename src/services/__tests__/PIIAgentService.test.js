import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock ServerLoggingService to avoid DB access during tests
vi.mock('../../../services/ServerLoggingService.js', () => ({
  default: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    log: vi.fn(),
  }
}));

import { AgentOrchestratorService } from '../../../agents/AgentOrchestratorService.js';
// import service under test after mocks
import { invokePIIAgent } from '../../../services/PIIAgentService.js';

// Stub the orchestrator method in tests
AgentOrchestratorService.invokeWithStrategy = vi.fn();

describe('PIIAgentService.invokePIIAgent', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns parsed pii result from orchestrator', async () => {
    AgentOrchestratorService.invokeWithStrategy.mockResolvedValueOnce({ pii: 'XXX', blocked: false });

    const res = await invokePIIAgent('openai', { chatId: 'c1', question: 'hello' });
    expect(res).toEqual({ pii: 'XXX', blocked: false });
    expect(AgentOrchestratorService.invokeWithStrategy).toHaveBeenCalled();
  });

  it('returns blocked result on content filter error', async () => {
    const err = new Error('filtered');
    err.response = { status: 400, data: { error: { code: 'content_filter' }, usage: { prompt_tokens: 1, completion_tokens: 2 } } };
    AgentOrchestratorService.invokeWithStrategy.mockRejectedValueOnce(err);

    const res = await invokePIIAgent('openai', { chatId: 'c2', question: 'bad' });
    expect(res.blocked).toBe(true);
    expect(res.pii).toBeNull();
  });
});
