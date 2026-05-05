import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import mongoose from 'mongoose';
import handler from '../api/batch/batch-stats.js';
import dbConnect from '../api/db/db-connect.js';
import { Batch } from '../models/batch.js';
import { BatchItem } from '../models/batchItem.js';

function makeRes() {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };

  return res;
}

describe('api/batch/batch-stats handler', () => {
  // track created batch and batch item IDs for cleanup
  const createdIds = { batches: [], batchItems: [] };

  beforeEach(async () => {
    await dbConnect();
  });

  afterEach(async () => {
    // Clean up created batches and batch items after each test
      await Batch.deleteMany({ _id: { $in: createdIds.batches } });
      await BatchItem.deleteMany({ _id: { $in: createdIds.batchItems } });
      await BatchItem.deleteMany({ batch: { $in: createdIds.batches } });
      await BatchItem.deleteMany({ batch: { $in: createdIds.batches.map(String) } });
      createdIds.batches = [];
      createdIds.batchItems = [];
  });

  it('returns counts for a batch including legacy string batch ids', async () => {
    const batch = await Batch.create({
      type: 'csv',
      name: 'status batch',
      aiProvider: 'azure',
      pageLanguage: 'en',
    });
    createdIds.batches.push(batch._id);

    const items = await BatchItem.create([
      { batch: batch._id, rowIndex: 1, chat: new mongoose.Types.ObjectId() },
      { batch: batch._id, rowIndex: 2, error: 'failed row' },
      { batch: batch._id, rowIndex: 3, shortQuery: true },
      { batch: batch._id, rowIndex: 4 },
    ]);
    createdIds.batchItems.push(...items.map(i => i._id));

    // Simulate older data where `batch` was stored as a string.
    const legacy = await BatchItem.collection.insertOne({
      batch: String(batch._id),
      rowIndex: 5,
      chat: new mongoose.Types.ObjectId(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    createdIds.batchItems.push(legacy.insertedId);

    const req = {
      method: 'GET',
      query: { batchId: String(batch._id) },
      path: '/api/batch/batch-stats',
      isAuthenticated: vi.fn(() => true),
      user: { role: 'admin', userId: 'test-admin' },
    };
    const res = makeRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      batchId: String(batch._id),
      workflow: 'Default',
      total: 5,
      processed: 2,
      failed: 1,
      skipped: 1,
      finished: 3,
    });
  });

  it('returns 400 when batchId is missing', async () => {
    const req = {
      method: 'GET',
      query: {},
      path: '/api/batch/batch-stats',
      isAuthenticated: vi.fn(() => true),
      user: { role: 'admin', userId: 'test-admin' },
    };
    const res = makeRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: 'batchId is required' });
  });
});
