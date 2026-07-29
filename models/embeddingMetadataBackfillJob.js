import mongoose from 'mongoose';

const EmbeddingMetadataBackfillJobSchema = new mongoose.Schema({
  status: {
    type: String,
    enum: ['queued', 'running', 'stopping', 'stopped', 'completed', 'failed'],
    required: true,
    default: 'queued',
  },
  phase: {
    type: String,
    enum: ['missing', 'interactions'],
    required: true,
    default: 'missing',
  },
  cursorSource: { type: String, default: 'expertFeedback' },
  lastProcessedId: { type: mongoose.Schema.Types.ObjectId, default: null },
  processed: { type: Number, default: 0 },
  updated: { type: Number, default: 0 },
  cleared: { type: Number, default: 0 },
  skipped: { type: Number, default: 0 },
  delayMs: { type: Number, default: 5000, min: 0, max: 300000 },
  latestBatchRecords: { type: [mongoose.Schema.Types.Mixed], default: [] },
  error: { type: String, default: '' },
  requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  startedAt: { type: Date, default: null },
  completedAt: { type: Date, default: null },
  heartbeatAt: { type: Date, default: null },
  leaseOwner: { type: String, default: '' },
  leaseUntil: { type: Date, default: null },
}, {
  timestamps: true,
  versionKey: false,
});

EmbeddingMetadataBackfillJobSchema.index({ status: 1, createdAt: -1 });
EmbeddingMetadataBackfillJobSchema.index({ createdAt: -1 });
EmbeddingMetadataBackfillJobSchema.index({ leaseUntil: 1 });

export const EmbeddingMetadataBackfillJob = mongoose.models.EmbeddingMetadataBackfillJob
  || mongoose.model('EmbeddingMetadataBackfillJob', EmbeddingMetadataBackfillJobSchema);
