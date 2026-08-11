import dbConnect from '../api/db/db-connect.js';
import { AuditLog } from '../models/auditLog.js';

const MAX_VALUE_LENGTH = 2000;
const SENSITIVE_KEY_PATTERN = /(password|secret|token|credential|api[-_.]?key)/i;

const normalizeValue = (value, settingKey) => {
  if (SENSITIVE_KEY_PATTERN.test(settingKey || '')) return '[REDACTED]';
  if (value === null || value === undefined) return null;
  return String(value).slice(0, MAX_VALUE_LENGTH);
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
      metadata,
    });
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
      metadata,
    });
  },

  async list({ limit = 50, skip = 0, before = null } = {}) {
    const safeLimit = Math.min(normalizePageValue(limit, 50), 100);
    const safeSkip = normalizePageValue(skip, 0);
    const query = buildListQuery(before);
    await dbConnect();
    const [entries, total] = await Promise.all([
      AuditLog.find(query)
        .sort({ createdAt: -1 })
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
