import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import handler from '../db-repair-expert-feedback.js';
import dbConnect from '../db-connect.js';
import { ExpertFeedback } from '../../../models/expertFeedback.js';

vi.mock('../../../middleware/auth.js', () => ({
  authMiddleware: vi.fn(),
  adminMiddleware: vi.fn(),
  withProtection: vi.fn((handlerFn) => handlerFn),
}));

function createRes() {
  return {
    statusCode: 200,
    payload: null,
    setHeader: () => {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    },
  };
}

describe('db-repair-expert-feedback', () => {
  beforeAll(async () => {
    await dbConnect();
  });

  afterEach(async () => {
    await ExpertFeedback.collection.deleteMany({});
  });

  // Raw inserts, so the stored type is exactly what's written here.
  const typeAfterRepair = async (type) => {
    const { insertedId } = await ExpertFeedback.collection.insertOne({ type, totalScore: 90 });
    const res = createRes();
    await handler({ method: 'POST' }, res);
    expect(res.statusCode).toBe(200);
    return (await ExpertFeedback.collection.findOne({ _id: insertedId })).type;
  };

  it.each(['ai', 'AI', ' ai '])('leaves an AI evaluation (%j) alone instead of relabelling it expert', async (type) => {
    expect(await typeAfterRepair(type)).toBe(type);
  });

  it.each(['', 'public', 'unknown'])('sets a missing or unknown type (%j) to expert', async (type) => {
    expect(await typeAfterRepair(type)).toBe('expert');
  });
});
