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
    }).mockImplementationOnce(() => ({ allowDiskUse: () => Promise.resolve([]) }));
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
});
