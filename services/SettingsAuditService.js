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

// Escapes a search term for literal use inside a RegExp — same pattern used
// elsewhere in this codebase for search-box filtering (e.g. api/util/chat-
// filters.js), not centralized into a shared helper yet. Without this, a
// search term containing regex metacharacters (".", "(", etc. — routine in
// e.g. a base URL or template ID being searched for) would be interpreted
// as a pattern instead of literal text.
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Case-insensitive substring match across the columns the audit table
// actually shows. No $text index on this collection — an admin-only, low-
// volume audit log doesn't justify the write-time cost of maintaining one
// just for this search box.
const buildSearchQuery = (search) => {
  const trimmed = typeof search === 'string' ? search.trim() : '';
  if (!trimmed) return {};
  const pattern = new RegExp(escapeRegex(trimmed), 'i');
  return { $or: [
    { actorEmail: pattern },
    { settingKey: pattern },
    { action: pattern },
    { previousValue: pattern },
    { newValue: pattern },
  ] };
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

  // `limit`/`skip` are a real page window (DataTables' own server-side
  // pagination — see SettingsPage.js), not a "load more" continuation, so
  // plain offset pagination is fine here: the standard, accepted tradeoff
  // every other server-side-paginated table in this app already makes (a
  // row inserted while paging can shift what lands on the next page), not
  // something specific to this endpoint.
  async list({ limit = 50, skip = 0, search = '' } = {}) {
    // `.limit(0)` means "no limit" to MongoDB/Mongoose, not "zero rows" — floor
    // at 1 so a caller-supplied 0 can't silently defeat the 100-row cap below.
    const safeLimit = Math.min(Math.max(normalizePageValue(limit, 50), 1), 100);
    const safeSkip = normalizePageValue(skip, 0);
    const query = buildSearchQuery(search);
    await dbConnect();
    // DataTables' server-side mode expects both counts on every request:
    // recordsFiltered (matching the current search) and recordsTotal (the
    // whole collection, for its "filtered from N total entries" footer).
    // The second count only runs when a search is active — without one
    // they're the same number, so there's nothing to gain from a second
    // query.
    const trimmedSearch = typeof search === 'string' ? search.trim() : '';
    const [entries, filteredTotal, total] = await Promise.all([
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
      trimmedSearch ? AuditLog.countDocuments({}) : null,
    ]);

    return {
      entries: entries.map(({ _id, ...entry }) => ({ id: String(_id), ...entry })),
      total: trimmedSearch ? total : filteredTotal,
      filteredTotal,
    };
  },
};

export default SettingsAuditService;
