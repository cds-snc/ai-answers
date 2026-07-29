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
          scannedBeforeCandidate: 0,
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
          scannedBeforeCandidate: 0,
          batchRecords: [{ action: 'updated' }],
        }),
    };
    const JobModel = {
      findOneAndUpdate: vi.fn()
        .mockResolvedValueOnce({
          _id: 'job-1',
          status: 'running',
          phase: 'missing',
          cursorSource: 'expertFeedback',
          lastProcessedId: null,
          delayMs: 0,
        })
        .mockResolvedValueOnce({
          _id: 'job-1',
          status: 'running',
          phase: 'missing',
          cursorSource: 'expertFeedback',
          lastProcessedId: '507f1f77bcf86cd799439011',
          delayMs: 0,
        })
        .mockResolvedValueOnce({
          _id: 'job-1',
          status: 'completed',
          phase: 'missing',
          cursorSource: 'expertFeedback',
          lastProcessedId: '507f1f77bcf86cd799439012',
          delayMs: 0,
        }),
      updateOne: vi.fn(),
    };
    const service = new EmbeddingMetadataBackfillJobService({ JobModel, metadataService });

    await service._run('job-1');

    expect(metadataService.backfillBatch).toHaveBeenCalledTimes(2);
    expect(metadataService.backfillBatch.mock.calls[0][0]).toEqual(expect.objectContaining({
      limit: 100,
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

  it('does not apply the write throttle while skipping windows with no missing records', async () => {
    const metadataService = {
      backfillBatch: vi.fn()
        .mockResolvedValueOnce({
          processed: 0,
          updated: 0,
          cleared: 0,
          skipped: 0,
          hasMore: true,
          lastProcessedId: '507f1f77bcf86cd799439011',
          cursorSource: 'expertFeedback',
          batchRecords: [],
        })
        .mockResolvedValueOnce({
          processed: 0,
          updated: 0,
          cleared: 0,
          skipped: 0,
          hasMore: false,
          lastProcessedId: '507f1f77bcf86cd799439012',
          cursorSource: 'expertFeedback',
          batchRecords: [],
        }),
    };
    const JobModel = {
      findOneAndUpdate: vi.fn()
        .mockResolvedValueOnce({
          _id: 'job-1',
          status: 'running',
          phase: 'missing',
          cursorSource: 'expertFeedback',
          lastProcessedId: null,
          delayMs: 30000,
        })
        .mockResolvedValueOnce({
          _id: 'job-1',
          status: 'running',
          phase: 'missing',
          cursorSource: 'expertFeedback',
          lastProcessedId: '507f1f77bcf86cd799439011',
          delayMs: 30000,
        })
        .mockResolvedValueOnce({
          _id: 'job-1',
          status: 'completed',
          phase: 'missing',
          cursorSource: 'expertFeedback',
          lastProcessedId: '507f1f77bcf86cd799439012',
          delayMs: 30000,
        }),
      updateOne: vi.fn(),
    };
    const service = new EmbeddingMetadataBackfillJobService({ JobModel, metadataService });
    service._waitForDelayOrStop = vi.fn().mockResolvedValue(false);

    await service._run('job-1');

    expect(metadataService.backfillBatch).toHaveBeenCalledTimes(2);
    expect(service._waitForDelayOrStop).not.toHaveBeenCalled();
  });

  it('restarts a stopped job with an empty cursor and counters', async () => {
    const restartedJob = {
      _id: '507f1f77bcf86cd799439099',
      status: 'queued',
      phase: 'missing',
      cursorSource: 'expertFeedback',
      lastProcessedId: null,
      processed: 0,
      updated: 0,
      cleared: 0,
      skipped: 0,
      delayMs: 1000,
    };
    const JobModel = {
      findOne: vi.fn().mockReturnValue({
        sort: vi.fn().mockResolvedValue(null),
      }),
      findOneAndUpdate: vi.fn().mockResolvedValue(restartedJob),
      create: vi.fn(),
    };
    const service = new EmbeddingMetadataBackfillJobService({
      JobModel,
      metadataService: { backfillBatch: vi.fn() },
    });
    service._schedule = vi.fn();

    const result = await service.start({
      restartJobId: restartedJob._id,
      delayMs: 1000,
    });

    expect(JobModel.findOneAndUpdate).toHaveBeenCalledWith(
      {
        _id: restartedJob._id,
        status: { $in: ['stopped', 'failed', 'completed'] },
      },
      {
        $set: expect.objectContaining({
          status: 'queued',
          cursorSource: 'expertFeedback',
          lastProcessedId: null,
          processed: 0,
          updated: 0,
          cleared: 0,
          skipped: 0,
          delayMs: 1000,
        }),
        $unset: {
          leaseOwner: 1,
          leaseUntil: 1,
        },
      },
      { new: true }
    );
    expect(JobModel.create).not.toHaveBeenCalled();
    expect(service._schedule).toHaveBeenCalledWith(restartedJob._id);
    expect(result).toEqual(expect.objectContaining({
      status: 'queued',
      processed: 0,
      lastProcessedId: null,
    }));
  });
});
