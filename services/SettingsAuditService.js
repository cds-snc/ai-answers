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

  async list({ limit = 50, skip = 0 } = {}) {
    const safeLimit = Math.min(normalizePageValue(limit, 50), 100);
    const safeSkip = normalizePageValue(skip, 0);
    await dbConnect();
    const query = {};
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
