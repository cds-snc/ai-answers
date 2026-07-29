import crypto from 'node:crypto';
import { EmbeddingMetadataBackfillJob } from '../models/embeddingMetadataBackfillJob.js';
import EmbeddingMetadataService from './EmbeddingMetadataService.js';

const ACTIVE_STATUSES = ['queued', 'running', 'stopping'];
const RUNNABLE_STATUSES = ['queued', 'running'];
const LEASE_MS = 10 * 60 * 1000;
const MISSING_SCAN_WINDOW = 100;

function serializeJob(job) {
  if (!job) return null;
  const value = typeof job.toObject === 'function' ? job.toObject() : job;
  return {
    id: String(value._id),
    status: value.status,
    phase: value.phase,
    cursorSource: value.cursorSource,
    lastProcessedId: value.lastProcessedId ? String(value.lastProcessedId) : null,
    processed: value.processed || 0,
    updated: value.updated || 0,
    cleared: value.cleared || 0,
    skipped: value.skipped || 0,
    delayMs: value.delayMs || 0,
    latestBatchRecords: Array.isArray(value.latestBatchRecords) ? value.latestBatchRecords : [],
    error: value.error || null,
    startedAt: value.startedAt || null,
    completedAt: value.completedAt || null,
    heartbeatAt: value.heartbeatAt || null,
    createdAt: value.createdAt || null,
    updatedAt: value.updatedAt || null,
  };
}

export class EmbeddingMetadataBackfillJobService {
  constructor({
    JobModel = EmbeddingMetadataBackfillJob,
    metadataService = EmbeddingMetadataService,
  } = {}) {
    this.JobModel = JobModel;
    this.metadataService = metadataService;
    this.workerId = crypto.randomUUID();
    this.runningJobIds = new Set();
    this.recoveryTimer = null;
  }

  async initialize() {
    const stoppingJobs = await this.JobModel.find({ status: 'stopping' }).select('_id');
    if (stoppingJobs.length) {
      await this.JobModel.updateMany(
        { _id: { $in: stoppingJobs.map(({ _id }) => _id) } },
        {
          $set: { status: 'stopped', completedAt: new Date() },
          $unset: { leaseOwner: 1, leaseUntil: 1 },
        }
      );
    }

    await this._recoverOne();
    if (!this.recoveryTimer) {
      this.recoveryTimer = setInterval(() => {
        this._recoverOne().catch((error) => {
          console.error('[EmbeddingMetadataBackfillJob] Recovery check failed:', error);
        });
      }, 60000);
      this.recoveryTimer.unref?.();
    }
  }

  async _recoverOne() {
    const recoverableJob = await this.JobModel.findOne({
      status: { $in: RUNNABLE_STATUSES },
      $or: [
        { leaseUntil: null },
        { leaseUntil: { $exists: false } },
        { leaseUntil: { $lte: new Date() } },
      ],
    }).sort({ createdAt: 1 }).select('_id');

    if (recoverableJob) this._schedule(recoverableJob._id);
  }

  async start({
    phase = 'missing',
    requestedBy = null,
    resumeJobId = null,
    restartJobId = null,
    delayMs = 5000,
  } = {}) {
    const activeJob = await this.JobModel.findOne({
      status: { $in: ACTIVE_STATUSES },
    }).sort({ createdAt: -1 });
    if (activeJob) {
      this._schedule(activeJob._id);
      return serializeJob(activeJob);
    }

    let job = null;
    if (restartJobId) {
      job = await this.JobModel.findOneAndUpdate(
        {
          _id: restartJobId,
          status: { $in: ['stopped', 'failed', 'completed'] },
        },
        {
          $set: {
            status: 'queued',
            phase: 'missing',
            cursorSource: 'expertFeedback',
            lastProcessedId: null,
            processed: 0,
            updated: 0,
            cleared: 0,
            skipped: 0,
            latestBatchRecords: [],
            error: '',
            startedAt: null,
            completedAt: null,
            heartbeatAt: null,
            delayMs,
          },
          $unset: { leaseOwner: 1, leaseUntil: 1 },
        },
        { new: true }
      );
    } else if (resumeJobId) {
      job = await this.JobModel.findOneAndUpdate(
        { _id: resumeJobId, status: { $in: ['stopped', 'failed'] } },
        {
          $set: {
            status: 'queued',
            error: '',
            completedAt: null,
            leaseOwner: '',
            leaseUntil: null,
            delayMs,
          },
        },
        { new: true }
      );
    }

    if (!job) {
      job = await this.JobModel.create({
        status: 'queued',
        phase: phase === 'interactions' ? 'interactions' : 'missing',
        requestedBy,
        delayMs,
      });
    }

    this._schedule(job._id);
    return serializeJob(job);
  }

  async getLatest() {
    const activeJob = await this.JobModel.findOne({
      status: { $in: ACTIVE_STATUSES },
    }).sort({ createdAt: -1 }).lean();
    const job = activeJob || await this.JobModel.findOne({}).sort({ createdAt: -1 }).lean();
    return serializeJob(job);
  }

  async stop(jobId = null) {
    const baseFilter = jobId ? { _id: jobId } : {};
    let job = await this.JobModel.findOneAndUpdate(
      { ...baseFilter, status: 'queued' },
      { $set: { status: 'stopped', completedAt: new Date() } },
      { new: true, sort: { createdAt: -1 } }
    );
    if (!job) {
      job = await this.JobModel.findOneAndUpdate(
        { ...baseFilter, status: 'running' },
        { $set: { status: 'stopping' } },
        { new: true, sort: { createdAt: -1 } }
      );
    }
    return serializeJob(job);
  }

  _schedule(jobId) {
    const id = String(jobId);
    if (this.runningJobIds.has(id)) return;
    this.runningJobIds.add(id);
    setImmediate(() => {
      this._run(jobId)
        .catch((error) => console.error('[EmbeddingMetadataBackfillJob] Worker failed:', error))
        .finally(() => this.runningJobIds.delete(id));
    });
  }

  async _claim(jobId) {
    const now = new Date();
    return this.JobModel.findOneAndUpdate(
      {
        _id: jobId,
        status: { $in: RUNNABLE_STATUSES },
        $or: [
          { leaseOwner: this.workerId },
          { leaseUntil: null },
          { leaseUntil: { $exists: false } },
          { leaseUntil: { $lte: now } },
        ],
      },
      {
        $set: {
          status: 'running',
          leaseOwner: this.workerId,
          leaseUntil: new Date(now.getTime() + LEASE_MS),
          heartbeatAt: now,
          startedAt: now,
        },
      },
      { new: true }
    );
  }

  async _run(jobId) {
    let job = await this._claim(jobId);
    if (!job) return;
    let scanLimit = job.phase === 'missing' ? MISSING_SCAN_WINDOW : 1;

    try {
      while (job.status === 'running') {
        const result = await this.metadataService.backfillBatch({
          lastProcessedId: job.lastProcessedId,
          limit: scanLimit,
          includeDetails: true,
          phase: job.phase,
        });
        const now = new Date();
        const update = {
          $set: {
            lastProcessedId: result.lastProcessedId || job.lastProcessedId,
            cursorSource: result.cursorSource || 'expertFeedback',
            latestBatchRecords: result.batchRecords || [],
            heartbeatAt: now,
            leaseUntil: new Date(now.getTime() + LEASE_MS),
          },
          $inc: {
            processed: result.processed || 0,
            updated: result.updated || 0,
            cleared: result.cleared || 0,
            skipped: result.skipped || 0,
          },
        };

        if (!result.hasMore) {
          update.$set.status = 'completed';
          update.$set.completedAt = now;
          update.$unset = { leaseOwner: 1, leaseUntil: 1 };
        }

        job = await this.JobModel.findOneAndUpdate(
          {
            _id: jobId,
            leaseOwner: this.workerId,
            status: { $in: ['running', 'stopping'] },
          },
          update,
          { new: true }
        );
        if (!job) return;
        if (job.status === 'stopping') {
          await this.JobModel.updateOne(
            { _id: jobId, status: 'stopping' },
            {
              $set: { status: 'stopped', completedAt: new Date() },
              $unset: { leaseOwner: 1, leaseUntil: 1 },
            }
          );
          return;
        }
        if (job.status !== 'running') return;

        if (job.phase === 'missing') {
          scanLimit = result.processed && result.scannedBeforeCandidate === 0
            ? 1
            : MISSING_SCAN_WINDOW;
        }

        // Empty windows contain no writes: continue scanning immediately.
        // The configured delay throttles actual metadata updates, not the
        // lightweight work needed to discard already-populated records.
        if (!result.processed) continue;

        if (await this._waitForDelayOrStop(jobId, job.delayMs || 0)) {
          await this.JobModel.updateOne(
            { _id: jobId, status: 'stopping' },
            {
              $set: { status: 'stopped', completedAt: new Date() },
              $unset: { leaseOwner: 1, leaseUntil: 1 },
            }
          );
          return;
        }
      }
    } catch (error) {
      await this.JobModel.updateOne(
        { _id: jobId, leaseOwner: this.workerId },
        {
          $set: {
            status: 'failed',
            error: error.message,
            completedAt: new Date(),
          },
          $unset: { leaseOwner: 1, leaseUntil: 1 },
        }
      );
      throw error;
    }
  }

  async _waitForDelayOrStop(jobId, delayMs) {
    let remaining = Math.max(0, delayMs);
    while (remaining > 0) {
      const waitMs = Math.min(remaining, 5000);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      remaining -= waitMs;
      const state = await this.JobModel.findById(jobId).select('status').lean();
      if (state?.status === 'stopping') return true;
      if (state?.status !== 'running') return false;
    }
    return false;
  }
}

export default new EmbeddingMetadataBackfillJobService();
