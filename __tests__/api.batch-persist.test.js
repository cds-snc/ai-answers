import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../middleware/auth.js', () => ({
  authMiddleware: vi.fn(async () => true),
  partnerOrAdminMiddleware: vi.fn(async () => true),
  withProtection: (handler) => handler,
}));

vi.mock('../api/db/db-connect.js', () => ({
  default: vi.fn().mockResolvedValue(undefined),
}));

const batchModelMock = vi.hoisted(() => ({
  findOneAndUpdate: vi.fn(),
}));
const settingsServiceMock = vi.hoisted(() => ({
  get: vi.fn(() => null),
}));

vi.mock('../models/batch.js', () => ({
  Batch: batchModelMock,
}));

vi.mock('../models/batchItem.js', () => ({
  BatchItem: {
    insertMany: vi.fn(),
  },
}));

vi.mock('../services/SettingsService.js', () => ({
  SettingsService: settingsServiceMock,
}));

import handler from '../api/batch/batch-persist.js';

function makeRes() {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  return res;
}

describe('api/batch/batch-persist handler', () => {
  beforeEach(() => {
    batchModelMock.findOneAndUpdate.mockReset();
    settingsServiceMock.get.mockReset();
    settingsServiceMock.get.mockReturnValue(null);
  });

  it('uses a normalized batch id in the update query', async () => {
    batchModelMock.findOneAndUpdate.mockResolvedValue({
      _id: '64fec1000000000000000001',
    });

    const req = {
      method: 'POST',
      body: {
        _id: '64fec1000000000000000001',
        status: 'ready',
        workflow: 'Default',
      },
      path: '/api/batch/batch-persist',
      isAuthenticated: vi.fn(() => true),
      user: { role: 'admin', userId: 'test-admin' },
    };
    const res = makeRes();

    await handler(req, res);

    expect(batchModelMock.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: '64fec1000000000000000001' },
      { $set: { status: 'ready', workflow: 'Default' } },
      { new: true, upsert: true }
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('rejects invalid batch ids before querying the database', async () => {
    const req = {
      method: 'POST',
      body: {
        _id: { $ne: 'anything' },
        status: 'ready',
      },
      path: '/api/batch/batch-persist',
      isAuthenticated: vi.fn(() => true),
      user: { role: 'admin', userId: 'test-admin' },
    };
    const res = makeRes();

    await handler(req, res);

    expect(batchModelMock.findOneAndUpdate).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Failed to persist batch',
      error: 'Invalid batch ID',
    });
  });

  it('normalizes an unsupported search provider to the configured default', async () => {
    settingsServiceMock.get.mockReturnValue('canadaca');
    batchModelMock.findOneAndUpdate.mockResolvedValue({
      _id: '64fec1000000000000000001',
    });

    const req = {
      method: 'POST',
      body: {
        _id: '64fec1000000000000000001',
        searchProvider: 'unsupported-provider',
      },
      path: '/api/batch/batch-persist',
      isAuthenticated: vi.fn(() => true),
      user: { role: 'partner', userId: 'test-partner' },
    };
    const res = makeRes();

    await handler(req, res);

    expect(batchModelMock.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: '64fec1000000000000000001' },
      { $set: { searchProvider: 'canadaca' } },
      { new: true, upsert: true }
    );
  });
});
