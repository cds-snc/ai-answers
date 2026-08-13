import dbConnect from '../api/db/db-connect.js';
import { AuditLog } from '../models/auditLog.js';
import ServerLoggingService from './ServerLoggingService.js';

const MAX_VALUE_LENGTH = 2000;
const SENSITIVE_KEY_PATTERN = /(password|secret|token|credential|api[-_.]?key)/i;

const normalizeValue = (value, settingKey) => {
  if (SENSITIVE_KEY_PATTERN.test(settingKey || '')) return '[REDACTED]';
  if (value === null || value === undefined) return null;
  return String(value).slice(0, MAX_VALUE_LENGTH);
};

// `metadata` is an arbitrary object, not a single settingKey/value pair, so it
// needs its own entries redacted individually — a metadata blob carrying a
// key like `apiKey` or `token` must not end up stored (and later displayed)
// in cleartext just because it rode along on an action that isn't itself a
// setting change.
const normalizeMetadata = (metadata) => {
  if (!metadata || typeof metadata !== 'object') return metadata ?? null;
  return Object.fromEntries(
    Object.entries(metadata).map(([key, value]) => [key, normalizeValue(value, key)])
  );
};

const normalizePageValue = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};

// Paging by skip alone is unstable: an entry recorded between two "load more"
// clicks pushes every row down one, so the next page repeats a row the reader
// has already seen. Callers pass the newest entry from their first page back as
// `before`, which pins later pages to that same snapshot. Rejects an unusable
// cursor rather than silently falling back to an unanchored read, which would
// reintroduce the drift it exists to prevent.
const buildListQuery = (before) => {
  if (before === null || before === undefined || before === '') return {};
  const anchor = new Date(before);
  if (Number.isNaN(anchor.getTime())) {
    throw new Error('Invalid before cursor for settings audit list');
  }
  return { createdAt: { $lte: anchor } };
};

// The primary action (a setting save, a cache refresh) is already done by the
// time an audit row is written, so a failed audit write must not fail it —
// surfacing an error would tell the admin a change didn't happen when it did.
// Log it instead, and never let it propagate. Shared by every audit writer
// (single, batch, and action) so this policy lives in exactly one place.
const recordAuditSafely = async (recordFn, failureMessage) => {
  try {
    return await recordFn();
  } catch (error) {
    await ServerLoggingService.error(failureMessage, 'system', error);
  }
};

const SettingsAuditService = {
  async recordSettingChange({
    actorUserId = null,
    actorEmail = 'System health monitor',
    source = 'system',
    settingKey,
    previousValue,
    newValue,
    metadata = null,
  }) {
    await dbConnect();
    return AuditLog.create({
      actorUserId: actorUserId ? String(actorUserId) : null,
      actorEmail,
      source,
      action: 'setting.updated',
      settingKey,
      previousValue: normalizeValue(previousValue, settingKey),
      newValue: normalizeValue(newValue, settingKey),
      metadata: normalizeMetadata(metadata),
    });
  },

  // One row per changed field, all sharing a single batch `createdAt` — the
  // audit trail stays as legible as today's per-field rows (settingKey,
  // previousValue, newValue columns unchanged), it's just that a section Save
  // now writes N of them in one round trip instead of one at a time. New
  // documents, not upserts, so insertMany needs no upsert/timestamp caveats.
  async recordSettingChangeBatch({
    actorUserId = null,
    actorEmail = 'System health monitor',
    source = 'system',
    entries,
  }) {
    if (!entries || entries.length === 0) return [];
    await dbConnect();
    const createdAt = new Date();
    const docs = entries.map(({ settingKey, previousValue, newValue }) => ({
      actorUserId: actorUserId ? String(actorUserId) : null,
      actorEmail,
      source,
      action: 'setting.updated',
      settingKey,
      previousValue: normalizeValue(previousValue, settingKey),
      newValue: normalizeValue(newValue, settingKey),
      metadata: null,
      createdAt,
      updatedAt: createdAt,
    }));
    return AuditLog.insertMany(docs, { ordered: false, timestamps: false });
  },

  async recordAction({
    actorUserId = null,
    actorEmail = 'System health monitor',
    source = 'system',
    action,
    metadata = null,
  }) {
    await dbConnect();
    return AuditLog.create({
      actorUserId: actorUserId ? String(actorUserId) : null,
      actorEmail,
      source,
      action,
      metadata: normalizeMetadata(metadata),
    });
  },

  recordAuditSafely,

  async list({ limit = 50, skip = 0, before = null } = {}) {
    // `.limit(0)` means "no limit" to MongoDB/Mongoose, not "zero rows" — floor
    // at 1 so a caller-supplied 0 can't silently defeat the 100-row cap below.
    const safeLimit = Math.min(Math.max(normalizePageValue(limit, 50), 1), 100);
    const safeSkip = normalizePageValue(skip, 0);
    const query = buildListQuery(before);
    await dbConnect();
    // TODO (code-review #10): countDocuments runs on every call — the
    // initial load, every "Load more" page, and every silent post-save/
    // post-refresh reload — even though the total usually hasn't changed
    // since the last fetch within the same anchored view. Only the first,
    // unanchored page (skip:0, no before) genuinely needs a fresh count;
    // look into whether callers can pass back the total they already have
    // (client already tracks auditTotal) for skip>0/before-anchored calls,
    // and validate that skipping the recount there doesn't produce a wrong
    // "hasMore" once actually tested against DocumentDB, not just reasoned
    // about — this crosses the client/server contract, not a local-only fix.
    const [entries, total] = await Promise.all([
      AuditLog.find(query)
        // Batched section-saves write multiple rows sharing one createdAt, so
        // createdAt alone can't order them consistently across two separate
        // paginated reads. `_id` is unique and immutable, making this a true
        // total order — ties resolve the same way every time.
        .sort({ createdAt: -1, _id: -1 })
        .skip(safeSkip)
        .limit(safeLimit)
        .lean(),
      AuditLog.countDocuments(query),
    ]);

    return {
      entries: entries.map(({ _id, ...entry }) => ({ id: String(_id), ...entry })),
      total,
      hasMore: total > safeSkip + entries.length,
    };
  },
};

export default SettingsAuditService;
