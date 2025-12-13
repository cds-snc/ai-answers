import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

// Mock modules before importing handler so protection middleware and DB connect are bypassed
vi.mock('c:/Users/hymary/repos/ai-answers/middleware/auth.js', () => ({
  withProtection: (handler) => handler,
  authMiddleware: {}
}));

vi.mock('c:/Users/hymary/repos/ai-answers/api/db/db-connect.js', () => ({
  __esModule: true,
  default: async () => Promise.resolve()
}));

// Mock response objects
function makeReq(query = {}) {
  return { method: 'GET', query };
}

function makeRes() {
  const res = {};
  res.status = vi.fn(() => res);
  res.json = vi.fn(() => res);
  return res;
}

describe('db-chat-logs handler filters (V2)', () => {
  let dbModule;
  let Chat;

  beforeEach(async () => {
    // load the handler module fresh each time
    dbModule = await import('c:/Users/hymary/repos/ai-answers/api/db/db-chat-logs.js');
    Chat = (await import('c:/Users/hymary/repos/ai-answers/models/chat.js')).Chat;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('builds aggregation pipeline when urlEn and urlFr are provided', async () => {
    const spy = vi.spyOn(Chat, 'aggregate').mockResolvedValue([]);
    const cnt = vi.spyOn(Chat, 'countDocuments').mockResolvedValue(0);

    const req = makeReq({ urlEn: 'example-en', urlFr: 'ex-fr', limit: '10' });
    const res = makeRes();

    const defaultExport = dbModule.default;
    await defaultExport(req, res);

    expect(spy).toHaveBeenCalled();
    const pipeline = spy.mock.calls[0][0];
    const hasOr = pipeline.some(stage => {
      if (!stage.$match) return false;
      const and = stage.$match.$and || [];
      return and.some(cond => cond.$or && Array.isArray(cond.$or));
    });
    expect(hasOr).toBe(true);
  });

  it('includes answerType match when provided', async () => {
    const spy = vi.spyOn(Chat, 'aggregate').mockResolvedValue([]);
    const cnt = vi.spyOn(Chat, 'countDocuments').mockResolvedValue(0);
    const req = makeReq({ answerType: 'pt-muni', limit: '5' });
    const res = makeRes();
    const defaultExport = dbModule.default;
    await defaultExport(req, res);

    expect(spy).toHaveBeenCalled();
    const pipeline = spy.mock.calls[0][0];
    const hasAnswerType = pipeline.some(stage => {
      if (!stage.$match) return false;
      const and = stage.$match.$and || [];
      return and.some(cond => cond['interactions.answer.answerType'] === 'pt-muni');
    });
    expect(hasAnswerType).toBe(true);
  });
});
