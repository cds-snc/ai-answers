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
import * as ChatModel from '../models/chat.js';
let handler;

describe('api/eval/eval-dashboard - per-filter pipeline creation', () => {
  let capturedPipeline;

  beforeEach(async () => {
    capturedPipeline = null;
    ChatModel.Chat.aggregate = vi.fn().mockImplementationOnce((pipeline) => {
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
    expect(ChatModel.Chat.aggregate).toHaveBeenCalled();
    expect(pipelineIncludes(answerType)).toBe(true);
  });

  it('includes partnerEval when provided', async () => {
    const partnerEval = 'needsImprovement';
    await runHandler({ partnerEval, startDate: new Date().toISOString(), endDate: new Date().toISOString() });
    expect(ChatModel.Chat.aggregate).toHaveBeenCalled();
    expect(pipelineIncludes(partnerEval)).toBe(true);
  });

  it('includes aiEval when provided', async () => {
    const aiEval = 'hasCitationError';
    await runHandler({ aiEval, startDate: new Date().toISOString(), endDate: new Date().toISOString() });
    expect(ChatModel.Chat.aggregate).toHaveBeenCalled();
    expect(pipelineIncludes(aiEval)).toBe(true);
  });

  it('filters referredPublic using the chat user field and referrer rules', async () => {
    await runHandler({
      userType: 'referredPublic',
      startDate: new Date().toISOString(),
      endDate: new Date().toISOString()
    });

    expect(ChatModel.Chat.aggregate).toHaveBeenCalled();
    const userMatchStage = capturedPipeline.find((stage) => {
      const clauses = stage.$match?.$and;
      return Array.isArray(clauses) && clauses.some((clause) => clause.user);
    });
    expect(userMatchStage).toBeDefined();

    const refMatchStage = capturedPipeline.find((stage) => {
      const clauses = stage.$match?.$and;
      return Array.isArray(clauses) && clauses.some((clause) => clause['interactions.referringUrl']);
    });
    expect(refMatchStage).toBeDefined();
    const refClauses = refMatchStage.$match.$and.filter((clause) => clause['interactions.referringUrl']);
    expect(refClauses).toHaveLength(2);
    expect(refClauses.some((clause) => clause['interactions.referringUrl'].$regex)).toBe(true);
    expect(refClauses.some((clause) => clause['interactions.referringUrl'].$not)).toBe(true);
  });

  it('pipeline includes hasDownload computation from tools lookup', async () => {
    await runHandler({ startDate: new Date().toISOString(), endDate: new Date().toISOString() });
    expect(ChatModel.Chat.aggregate).toHaveBeenCalled();
    expect(pipelineIncludes('downloadWebPage')).toBe(true);
    expect(pipelineIncludes('hasDownload')).toBe(true);
    expect(pipelineIncludes('firstToolId')).toBe(true);
  });

  it('calls aggregate exactly once, not twice', async () => {
    await runHandler({ startDate: new Date().toISOString(), endDate: new Date().toISOString() });
    expect(ChatModel.Chat.aggregate).toHaveBeenCalledTimes(1);
  });

  it('does not include $setWindowFields in the pipeline', async () => {
    await runHandler({ startDate: new Date().toISOString(), endDate: new Date().toISOString() });
    expect(pipelineIncludes('$setWindowFields')).toBe(false);
  });

  it('returns hasMore when the query has more rows than the page size', async () => {
    ChatModel.Chat.aggregate = vi.fn().mockImplementationOnce((pipeline) => {
      capturedPipeline = pipeline;
      return { allowDiskUse: () => Promise.resolve(Array.from({ length: 101 }, () => ({}))) };
    });
    const req = { method: 'GET', query: { startDate: new Date().toISOString(), endDate: new Date().toISOString(), length: '100' } };
    const res = { status: vi.fn(() => res), json: vi.fn(() => res) };
    await handler(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ hasMore: true }));
    expect(res.json.mock.calls[0][0]).not.toHaveProperty('totalCount');
  });

  it('does not make a second aggregation pass when the page is exhausted', async () => {
    ChatModel.Chat.aggregate = vi.fn()
      .mockImplementationOnce(() => ({ allowDiskUse: () => Promise.resolve([]) }));
    const req = { method: 'GET', query: {
      startDate: new Date().toISOString(),
      endDate: new Date().toISOString(),
      start: '400',
      length: '100'
    }};
    const res = { status: vi.fn(() => res), json: vi.fn(() => res) };
    await handler(req, res);
    expect(ChatModel.Chat.aggregate).toHaveBeenCalledTimes(1);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ hasMore: false }));
  });
});
