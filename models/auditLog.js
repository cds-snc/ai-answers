import mongoose from 'mongoose';

const auditLogSchema = new mongoose.Schema({
  actorUserId: { type: String, default: null },
  actorEmail: { type: String, required: true },
  source: { type: String, enum: ['admin', 'system'], required: true },
  action: { type: String, required: true },
  settingKey: { type: String, default: null },
  previousValue: { type: String, default: null },
  newValue: { type: String, default: null },
  metadata: { type: mongoose.Schema.Types.Mixed, default: null },
}, {
  timestamps: true,
  versionKey: false,
  id: false,
});

auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ settingKey: 1, createdAt: -1 });

export const AuditLog = mongoose.models.AuditLog || mongoose.model('AuditLog', auditLogSchema);
