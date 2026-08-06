import { describe, it, expect, vi, beforeEach } from 'vitest';
import handler from '../experimental-batches-delete-all.js';
import dbConnect from '../../db/db-connect.js';
import { ExperimentalBatch } from '../../../models/experimentalBatch.js';
import { ExperimentalBatchItem } from '../../../models/experimentalBatchItem.js';

vi.mock('../../db/db-connect.js', () => ({ default: vi.fn() }));
vi.mock('../../../models/experimentalBatch.js', () => ({
  ExperimentalBatch: { deleteMany: vi.fn() }
}));
vi.mock('../../../models/experimentalBatchItem.js', () => ({
  ExperimentalBatchItem: { deleteMany: vi.fn() }
}));
vi.mock('../../../middleware/auth.js', () => ({
  authMiddleware: vi.fn((req, res, next) => next()),
  adminMiddleware: vi.fn((req, res, next) => next()),
  withProtection: vi.fn((handlerFn) => handlerFn)
}));

describe('delete all experimental batches API', () => {
  let res;

  beforeEach(() => {
    vi.clearAllMocks();
    res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    dbConnect.mockResolvedValue();
    ExperimentalBatchItem.deleteMany.mockResolvedValue({ deletedCount: 4 });
    ExperimentalBatch.deleteMany.mockResolvedValue({ deletedCount: 2 });
  });

  it('deletes experimental runs and items without touching datasets', async () => {
    await handler({ method: 'DELETE' }, res);

    expect(ExperimentalBatchItem.deleteMany).toHaveBeenCalledWith({});
    expect(ExperimentalBatch.deleteMany).toHaveBeenCalledWith({});
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      deletedBatches: 2,
      deletedBatchItems: 4
    });
  });

  it('rejects non-delete methods', async () => {
    await handler({ method: 'GET' }, res);

    expect(res.status).toHaveBeenCalledWith(405);
    expect(ExperimentalBatchItem.deleteMany).not.toHaveBeenCalled();
  });
});
