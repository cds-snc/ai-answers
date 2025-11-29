import mongoose from 'mongoose';

const ChatMetricsSchema = new mongoose.Schema({}, { strict: false, _id: false });

const SessionStateSchema = new mongoose.Schema({
  sessionId: { type: String, required: true, unique: true, index: true },
  chatIds: { type: [String], default: [] },
  createdAt: { type: Date, default: () => new Date() },
  lastSeen: { type: Date, default: () => new Date() },
  ttl: { type: Number, default: 1000 * 60 * 60 },
  isAuthenticated: { type: Boolean, default: false },
  requestCount: { type: Number, default: 0 },
  errorCount: { type: Number, default: 0 },
  totalLatencyMs: { type: Number, default: 0 },
  lastLatencyMs: { type: Number, default: 0 },
  requestTimestamps: { type: [Date], default: [] },
  errorTypes: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
  chatMetrics: { type: ChatMetricsSchema, default: () => ({}) }
}, { timestamps: false, minimize: false });

export const SessionState = mongoose.models.SessionState || mongoose.model('SessionState', SessionStateSchema);
