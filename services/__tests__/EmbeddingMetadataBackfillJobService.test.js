import { describe, it, expect, vi } from 'vitest';
import { EmbeddingMetadataBackfillJobService } from '../EmbeddingMetadataBackfillJobService.js';

describe('EmbeddingMetadataBackfillJobService', () => {
  it('processes exactly one metadata record at a time and persists the cursor', async () => {
    const metadataService = {
      backfillBatch: vi.fn()
        .mockResolvedValueOnce({
          processed: 1,
          updated: 1,
          cleared: 0,
          skipped: 0,
          hasMore: true,
          lastProcessedId: '507f1f77bcf86cd799439011',
          cursorSource: 'expertFeedback',
          batchRecords: [{ action: 'updated' }],
        })
        .mockResolvedValueOnce({
          processed: 1,
          updated: 1,
          cleared: 0,
          skipped: 0,
          hasMore: false,
          lastProcessedId: '507f1f77bcf86cd799439012',
          cursorSource: 'expertFeedback',
          batchRecords: [{ action: 'updated' }],
        }),
    };
    const JobModel = {
      findOneAndUpdate: vi.fn()
        .mockResolvedValueOnce({
          _id: 'job-1',
          status: 'running',
          phase: 'missing',
          lastProcessedId: null,
          delayMs: 0,
        })
        .mockResolvedValueOnce({
          _id: 'job-1',
          status: 'running',
          phase: 'missing',
          lastProcessedId: '507f1f77bcf86cd799439011',
          delayMs: 0,
        })
        .mockResolvedValueOnce({
          _id: 'job-1',
          status: 'completed',
          phase: 'missing',
          lastProcessedId: '507f1f77bcf86cd799439012',
          delayMs: 0,
        }),
      updateOne: vi.fn(),
    };
    const service = new EmbeddingMetadataBackfillJobService({ JobModel, metadataService });

    await service._run('job-1');

    expect(metadataService.backfillBatch).toHaveBeenCalledTimes(2);
    expect(metadataService.backfillBatch.mock.calls[0][0]).toEqual(expect.objectContaining({
      limit: 1,
      lastProcessedId: null,
    }));
    expect(metadataService.backfillBatch.mock.calls[1][0]).toEqual(expect.objectContaining({
      limit: 1,
      lastProcessedId: '507f1f77bcf86cd799439011',
    }));
  });

  it('marks a queued job stopped without starting the worker', async () => {
    const stoppedJob = {
      _id: 'job-1',
      status: 'stopped',
      phase: 'missing',
      delayMs: 5000,
    };
    const JobModel = {
      findOneAndUpdate: vi.fn().mockResolvedValueOnce(stoppedJob),
    };
    const service = new EmbeddingMetadataBackfillJobService({
      JobModel,
      metadataService: { backfillBatch: vi.fn() },
    });

    const result = await service.stop('job-1');

    expect(result.status).toBe('stopped');
    expect(JobModel.findOneAndUpdate).toHaveBeenCalledTimes(1);
  });
});
