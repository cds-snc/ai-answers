import { describe, it, expect, vi, beforeEach } from 'vitest';
// Mock auth wrapper and DB connect using absolute paths so mocks apply
vi.mock('../middleware/auth.js', () => ({
  withProtection: (handler) => handler,
  authMiddleware: {},
  partnerOrAdminMiddleware: {}
}));
vi.mock('../api/db/db-connect.js', () => ({
  __esModule: true,
  default: async () => Promise.resolve()
}));
import * as InteractionModel from '../models/interaction.js';
let handler;

describe('api/eval/eval-dashboard - per-filter pipeline creation', () => {
  let capturedPipeline;

  beforeEach(async () => {
    capturedPipeline = null;
    InteractionModel.Interaction.aggregate = vi.fn().mockImplementationOnce((pipeline) => {
      capturedPipeline = pipeline;
      return { allowDiskUse: () => Promise.resolve([]) };
    });
    const mod = await import('../api/eval/eval-dashboard.js');
    handler = mod && (mod.default || mod);
  });

  const runHandler = async (query) => {
    const req = { method: 'GET', query };
    const res = { status: vi.fn(() => res), json: vi.fn(() => res) };
    try {
      await handler(req, res);
    } catch (e) {
      // ignore - we only assert aggregate invocation and pipeline
    }
  };

  const pipelineIncludes = (needle) => {
    return Array.isArray(capturedPipeline) && JSON.stringify(capturedPipeline).includes(needle);
  };

  it('includes answerType when provided', async () => {
    const answerType = 'normal';
    await runHandler({ answerType, startDate: new Date().toISOString(), endDate: new Date().toISOString() });
    expect(InteractionModel.Interaction.aggregate).toHaveBeenCalled();
    expect(pipelineIncludes(answerType)).toBe(true);
  });

  it('includes partnerEval when provided', async () => {
    const partnerEval = 'needsImprovement';
    await runHandler({ partnerEval, startDate: new Date().toISOString(), endDate: new Date().toISOString() });
    expect(InteractionModel.Interaction.aggregate).toHaveBeenCalled();
    expect(pipelineIncludes(partnerEval)).toBe(true);
  });

  it('includes aiEval when provided', async () => {
    const aiEval = 'hasCitationError';
    await runHandler({ aiEval, startDate: new Date().toISOString(), endDate: new Date().toISOString() });
    expect(InteractionModel.Interaction.aggregate).toHaveBeenCalled();
    expect(pipelineIncludes(aiEval)).toBe(true);
  });

  it('pipeline includes hasDownload computation from tools lookup', async () => {
    await runHandler({ startDate: new Date().toISOString(), endDate: new Date().toISOString() });
    expect(InteractionModel.Interaction.aggregate).toHaveBeenCalled();
    expect(pipelineIncludes('downloadWebPage')).toBe(true);
    expect(pipelineIncludes('hasDownload')).toBe(true);
    expect(pipelineIncludes('firstToolId')).toBe(true);
  });

  it('calls aggregate exactly once, not twice', async () => {
    await runHandler({ startDate: new Date().toISOString(), endDate: new Date().toISOString() });
    expect(InteractionModel.Interaction.aggregate).toHaveBeenCalledTimes(1);
  });

  it('includes $setWindowFields with totalCount in the pipeline', async () => {
    await runHandler({ startDate: new Date().toISOString(), endDate: new Date().toISOString() });
    expect(pipelineIncludes('$setWindowFields')).toBe(true);
    expect(pipelineIncludes('totalCount')).toBe(true);
  });

  it('passes totalCount from the result through to the response', async () => {
    InteractionModel.Interaction.aggregate = vi.fn().mockImplementationOnce((pipeline) => {
      capturedPipeline = pipeline;
      return { allowDiskUse: () => Promise.resolve([{ totalCount: 42 }]) };
    });
    const req = { method: 'GET', query: { startDate: new Date().toISOString(), endDate: new Date().toISOString() } };
    const res = { status: vi.fn(() => res), json: vi.fn(() => res) };
    await handler(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ totalCount: 42 }));
  });

  it('returns correct totalCount when $skip exhausts all results (stale client)', async () => {
    // First call: $skip removed all docs so results is empty
    // Second call: fallback count pipeline returns the real total
    InteractionModel.Interaction.aggregate = vi.fn()
      .mockImplementationOnce(() => ({ allowDiskUse: () => Promise.resolve([]) }))
      .mockImplementationOnce(() => ({ allowDiskUse: () => Promise.resolve([{ totalCount: 400 }]) }));
    const req = { method: 'GET', query: {
      startDate: new Date().toISOString(),
      endDate: new Date().toISOString(),
      start: '400',
      length: '100'
    }};
    const res = { status: vi.fn(() => res), json: vi.fn(() => res) };
    await handler(req, res);
    expect(InteractionModel.Interaction.aggregate).toHaveBeenCalledTimes(2);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ recordsTotal: 400 }));
  });
});
