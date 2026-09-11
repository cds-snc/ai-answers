/**
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ExperimentalBatchService from '../ExperimentalBatchService.js';
import { ExperimentalBatch } from '../../../models/experimentalBatch.js';
import { ExperimentalBatchItem } from '../../../models/experimentalBatchItem.js';
import { getGraphApp, listGraphs } from '../../../agents/graphs/registry.js';
import { DEFAULT_WORKFLOW } from '../../../src/config/workflows.js';

vi.mock('../../../models/experimentalBatch.js', () => ({
  ExperimentalBatch: { findById: vi.fn() },
}));

vi.mock('../../../models/experimentalBatchItem.js', () => ({
  ExperimentalBatchItem: {
    findById: vi.fn(),
    findOne: vi.fn(),
    findOneAndUpdate: vi.fn(),
    updateOne: vi.fn(),
  },
}));

vi.mock('../ExperimentalQueueService.js', () => ({
  default: { enqueue: vi.fn(), registerProcessor: vi.fn(), on: vi.fn() },
}));

vi.mock('../ExperimentalAnalyzerRegistry.js', () => ({
  default: { get: vi.fn(), initialize: vi.fn().mockResolvedValue() },
}));

// Keep the real registry (listGraphs) so the test pins the resolved name
// against graph names that actually exist; only the loader is stubbed.
vi.mock('../../../agents/graphs/registry.js', async (importOriginal) => ({
  ...(await importOriginal()),
  getGraphApp: vi.fn(),
}));

vi.mock('../../../agents/graphs/requestContext.js', () => ({
  graphRequestContext: { run: vi.fn((store, callback) => callback()) },
}));

const mockStream = {
  async *[Symbol.asyncIterator]() {
    yield { result: { answer: 'It is 4' } };
  },
};

function mockBatchAndItem({ workflow } = {}) {
  const batch = {
    _id: 'batch-id',
    status: 'queued',
    type: 'batch',
    createdBy: null,
    config: { pageLanguage: 'en', aiProvider: 'azure', ...(workflow === undefined ? {} : { workflow }) },
  };
  const item = {
    _id: 'item-id',
    retryCount: 1,
    rowIndex: 1,
    question: 'What is 2+2?',
    status: 'processing',
    save: vi.fn().mockResolvedValue(undefined),
    markModified: vi.fn(),
  };
  ExperimentalBatch.findById.mockResolvedValue(batch);
  ExperimentalBatchItem.findOneAndUpdate.mockResolvedValue(item);
  ExperimentalBatchItem.findOne.mockReturnValue({ sort: vi.fn().mockResolvedValue(null) });
  return { batch, item };
}

describe('batch default workflow resolution (issue #1792)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getGraphApp.mockResolvedValue({ stream: vi.fn().mockResolvedValue(mockStream) });
  });

  it("resolves the legacy 'DefaultGraph' alias to a graph that exists in the registry", async () => {
    mockBatchAndItem({ workflow: 'DefaultGraph' });

    const result = await ExperimentalBatchService._processItem('batch-id', 'item-id');

    expect(getGraphApp).toHaveBeenCalledWith(DEFAULT_WORKFLOW);
    expect(listGraphs()).toContain(DEFAULT_WORKFLOW);
    expect(result.status).toBe('completed');
  });

  it('falls back to a registered graph when config.workflow is missing', async () => {
    mockBatchAndItem();

    const result = await ExperimentalBatchService._processItem('batch-id', 'item-id');

    expect(getGraphApp).toHaveBeenCalledWith(DEFAULT_WORKFLOW);
    expect(listGraphs()).toContain(DEFAULT_WORKFLOW);
    expect(result.status).toBe('completed');
  });
});
