import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

// Mock modules before importing handler so protection middleware and DB connect are bypassed
vi.mock('../middleware/auth.js', () => ({
  withProtection: (handler) => handler,
  authMiddleware: {}
}));

vi.mock('../api/db/db-connect.js', () => ({
  __esModule: true,
  default: async () => Promise.resolve()
}));

// Mock response objects
function makeReq(query = {}, user) {
  return { method: 'GET', query, user };
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
  let BatchItem;
  let Batch;

  beforeEach(async () => {
    // load the handler module fresh each time
    dbModule = await import('../api/db/db-chat-logs.js');
    Chat = (await import('../models/chat.js')).Chat;
    BatchItem = (await import('../models/batchItem.js')).BatchItem;
    Batch = (await import('../models/batch.js')).Batch;
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
      return and.some(cond => cond['interactions.answerType'] === 'pt-muni');
    });
    expect(hasAnswerType).toBe(true);
  });

  it('routes referredPublic chats through the aggregation path with the referrer filter', async () => {
    const spy = vi.spyOn(Chat, 'aggregate').mockResolvedValue([]);
    const cnt = vi.spyOn(Chat, 'countDocuments').mockResolvedValue(0);
    const req = makeReq({ userType: 'referredPublic', limit: '5' });
    const res = makeRes();

    const defaultExport = dbModule.default;
    await defaultExport(req, res);

    expect(spy).toHaveBeenCalled();
    const pipeline = spy.mock.calls[0][0];
    const andMatch = pipeline.find(stage => stage.$match && stage.$match.$and);
    expect(andMatch).toBeDefined();
    const urlFilters = andMatch.$match.$and.filter((cond) => cond['interactions.referringUrl']);
    expect(urlFilters.length).toBeGreaterThanOrEqual(2);
    expect(urlFilters.some((cond) => String(cond['interactions.referringUrl'].$regex || '').includes('canada\\.ca|gc\\.ca'))).toBe(true);
  });

  it('normalizes batchId before querying batch items', async () => {
    const batchId = '64fec1000000000000000001';
    const batchItemSelect = vi.fn().mockResolvedValue([{ chat: 'chat-1' }]);
    const batchFind = vi.spyOn(BatchItem, 'find').mockReturnValue({ select: batchItemSelect });
    const aggregate = vi.spyOn(Chat, 'aggregate').mockResolvedValue([]);
    // The batch must exist and be accessible (admin) before its items are read.
    vi.spyOn(Batch, 'findById').mockReturnValue({ lean: () => Promise.resolve({ createdBy: 'someone' }) });

    const req = makeReq({ batchId, limit: '5' }, { role: 'admin', userId: 'test-admin' });
    const res = makeRes();

    const defaultExport = dbModule.default;
    await defaultExport(req, res);

    expect(batchFind).toHaveBeenCalledWith({ batch: batchId });
    expect(batchItemSelect).toHaveBeenCalledWith('chat');
    expect(aggregate).toHaveBeenCalled();
  });
});
