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

// Batched section-saves write multiple rows sharing one `createdAt`, so a
// plain createdAt sort has no way to break ties deterministically across two
// separate paginated reads. `_id` is unique, immutable, and already present
// on every document, making it a stable secondary sort key at no schema cost.
// This is the only index on this collection: SettingsAuditService.list()'s
// only read path (buildSearchQuery) sorts { createdAt: -1, _id: -1 } always,
// and its search is an unanchored, multi-field regex $or (actorEmail/
// settingKey/action/previousValue/newValue) that can't use any index anyway
// — so a separate { settingKey: 1, createdAt: -1 } index that previously
// existed here was pure write overhead with no query to serve it, and a
// standalone { createdAt: -1 } index is redundant with this compound one
// (a compound index's leading field(s) already serve a sort on just that
// prefix). Revisit if a settingKey-only filter or a real search index
// (rather than a bare regex) gets added later.
auditLogSchema.index({ createdAt: -1, _id: -1 });

export const AuditLog = mongoose.models.AuditLog || mongoose.model('AuditLog', auditLogSchema);
