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
    const aiEval = 'needsImprovement';
    await runHandler({ aiEval, startDate: new Date().toISOString(), endDate: new Date().toISOString() });
    expect(ChatModel.Chat.aggregate).toHaveBeenCalled();
    expect(pipelineIncludes(aiEval)).toBe(true);
  });

  it('aiEval=hasCitationError filters on the independent aiHasCitationError flag, not the base aiEval value', async () => {
    // Regression: hasCitationError used to be a value the base aiEval field
    // itself could take (masking whichever of correct/needsImprovement/
    // hasError the sentences actually scored). It's now an independent
    // boolean that stacks alongside the base value instead - the filter
    // condition needs to match that new shape, not the old string value.
    await runHandler({ aiEval: 'hasCitationError', startDate: new Date().toISOString(), endDate: new Date().toISOString() });
    expect(ChatModel.Chat.aggregate).toHaveBeenCalled();
    // andFilters get wrapped as { $match: { $and: [...] } } - the individual
    // condition could be a top-level entry in that $and array, so search it
    // rather than assuming a flat $match shape.
    const matchStage = capturedPipeline.find((stage) => stage.$match && Array.isArray(stage.$match.$and));
    expect(matchStage).toBeTruthy();
    const hasCitationErrorClause = matchStage.$match.$and.some((c) => c['interactions.aiHasCitationError'] === true);
    expect(hasCitationErrorClause).toBe(true);
    // Never matched as a literal base-field value anymore.
    const staleValueMatch = matchStage.$match.$and.some((c) => c['interactions.aiEval'] === 'hasCitationError');
    expect(staleValueMatch).toBe(false);
  });

  it('global search (the table search box) matches referringUrl, not just chatId/department/etc', async () => {
    // Regression: referringUrl was added as a visible, sortable column on
    // the Eval Dashboard but never added to the global search's orClauses -
    // searching a referring URL fragment silently returned nothing even
    // though the value was right there in the table.
    const term = '/en/ircc/services';
    await runHandler({ search: term, startDate: new Date().toISOString(), endDate: new Date().toISOString() });
    expect(ChatModel.Chat.aggregate).toHaveBeenCalled();
    const matchStage = capturedPipeline.find((stage) => stage.$match && Array.isArray(stage.$match.$or));
    expect(matchStage).toBeTruthy();
    const hasReferringUrlClause = matchStage.$match.$or.some((clause) => clause.referringUrl && clause.referringUrl.$regex);
    expect(hasReferringUrlClause).toBe(true);
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
    expect(pipelineIncludes('answerToolIds')).toBe(true);
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
    // Group-based pagination (see eval-dashboard.js's TODO on the
    // $group/$unwind block) determines hasMore by counting DISTINCT
    // chatIds in the flattened result, not raw row count - 101 rows all
    // sharing one chatId would read as hasMore: false (only 1 chat), so
    // the mock needs 101 distinct chatIds to actually exercise this.
    ChatModel.Chat.aggregate = vi.fn().mockImplementationOnce((pipeline) => {
      capturedPipeline = pipeline;
      return { allowDiskUse: () => Promise.resolve(Array.from({ length: 101 }, (_, i) => ({ chatId: `chat-${i}` }))) };
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

  // Regression: the UI groups a multi-turn chat's rows together visually
  // (rowspan'd Chat ID/Department/Program), which only reads correctly if
  // same-chat rows are actually adjacent in whatever order is currently
  // sorted. Before this fix, the $sort stage only tiebreaks on `_id` (the
  // interaction's own id), which is unrelated to chatId and does nothing to
  // keep a chat's rows together.
  describe('sort stage keeps a multi-turn chat\'s rows adjacent (grouping regression)', () => {
    const findSortStage = () => capturedPipeline.find((stage) => stage.$sort);

    it('carries chatCreatedAt from the base Chat document into both $project stages', async () => {
      await runHandler({ startDate: new Date().toISOString(), endDate: new Date().toISOString() });
      const firstProject = capturedPipeline.find((stage) => stage.$project && stage.$project.chatId === 1);
      expect(firstProject.$project.chatCreatedAt).toBe('$createdAt');

      const finalProject = capturedPipeline.find((stage) => stage.$project && stage.$project.createdAt === '$interactions.createdAt');
      expect(finalProject.$project.chatCreatedAt).toBe(1);
    });

    it('default sort (no orderBy) sorts by the chat-level date, not the interaction\'s own, with chatId/questionNumber tiebreakers', async () => {
      await runHandler({ startDate: new Date().toISOString(), endDate: new Date().toISOString() });
      const sortStage = findSortStage();
      expect(sortStage.$sort).toEqual({ chatCreatedAt: -1, chatId: -1, questionNumber: 1 });
    });

    it('an explicit column sort (e.g. department) keeps chatCreatedAt/chatId/questionNumber as tiebreakers', async () => {
      await runHandler({
        orderBy: 'department',
        orderDir: 'asc',
        startDate: new Date().toISOString(),
        endDate: new Date().toISOString()
      });
      const sortStage = findSortStage();
      expect(sortStage.$sort).toEqual({ department: 1, chatCreatedAt: -1, chatId: -1, questionNumber: 1 });
    });
  });
});
