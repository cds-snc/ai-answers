import dbConnect from '../api/db/db-connect.js';
import { Setting } from '../models/setting.js';
import { requireLiteralString, requireString } from '../api/util/db-query.js';
import SettingsAuditService from './SettingsAuditService.js';
import { DEFAULT_WORKFLOW } from '../src/config/workflows.js';

// The setting is already written to the cache and the database by the time the
// audit row goes in, so a failed audit write must not fail the save — surfacing
// it as an error would tell the admin a change did not happen when it did.
// `recordAuditSafely` logs the failure instead of throwing it, which is also
// how the health monitor treats its own failures.
const recordAuditEntry = async (auditContext, settingKey, previousValue, newValue) => {
  if (!auditContext || previousValue === newValue) return;
  await SettingsAuditService.recordAuditSafely(
    () => SettingsAuditService.recordSettingChange({ ...auditContext, settingKey, previousValue, newValue }),
    'Failed to record settings audit entry'
  );
};

// Same non-fatal policy as recordAuditEntry, for a batch of fields saved
// together by one section Save click.
const recordAuditEntryBatch = async (auditContext, entries) => {
  if (!auditContext || !entries || entries.length === 0) return;
  await SettingsAuditService.recordAuditSafely(
    () => SettingsAuditService.recordSettingChangeBatch({ ...auditContext, entries }),
    'Failed to record settings audit batch entry'
  );
};

// Default values for settings that must always exist.
// Seeded on startup if missing from the database.
const SETTING_DEFAULTS = {
  // Seeded alongside model.default so an environment that has never had a
  // workflow saved reports the value it actually runs, instead of returning
  // null and leaving each caller to substitute its own fallback — which made
  // "nothing is stored" look identical to "GenericGraph is stored" on the
  // Settings page and in the chat Options dropdown.
  'workflow.default': DEFAULT_WORKFLOW,
  'model.default': 'openai-gpt51',
  'chat.transport': 'sse',
  'guardrail.indigenousLanguageBlocking': 'true',
  'systemHealth.enabled': 'false',
  'systemHealth.checks.database.enabled': 'true',
  'systemHealth.checks.search.enabled': 'true',
  'systemHealth.checks.llm.enabled': 'true',
  'systemHealth.autoDisableOnError': 'true',
  'systemHealth.failureThreshold': '5',
  'systemHealth.failureWindowMinutes': '5',
  'systemHealth.intervalMinutes': '1',
  'systemHealth.fastIntervalSeconds': '30',
  'systemHealth.alertRecipients': '',
  'systemHealth.alertTemplateId': '',
  'systemHealth.errorTemplateId': '',
  'connectivity.simulation.database': 'false',
  'connectivity.simulation.search': 'false',
  'connectivity.simulation.llm': 'false',
  'session.singleAnonymousChatRunEnabled': 'true',
  'session.authenticatedRateLimitCapacity': '300',
  'session.authenticatedRateLimitRefillPerSec': '300',
};

const EMPTY_ALLOWED_SETTINGS = new Set([
  'systemHealth.alertRecipients',
  'systemHealth.alertTemplateId',
  'systemHealth.errorTemplateId',
  'site.baseUrl',
  'session.maxActiveSessions',
  'twoFA.templateId',
  'notify.resetTemplateId',
]);

class SettingsServiceClass {
  constructor() {
    this.cache = {};
  }

  async loadAll() {
    this.cache = {};
    await dbConnect();
    const settings = await Setting.find({});
    settings.forEach(s => {
      this.cache[s.key] = s.value;
    });

    // Seed any required defaults that aren't in the DB yet
    for (const [key, value] of Object.entries(SETTING_DEFAULTS)) {
      if (!this.cache.hasOwnProperty(key)) {
        await this.set(key, value);
        console.log(`[SettingsService] Seeded missing setting: ${key} = ${value}`);
      }
    }

    console.log(`[SettingsService] Loaded ${settings.length} settings into cache.`);
  }

  async refreshCache() {
    await this.loadAll();
  }

  get(key) {
    key = requireLiteralString(key, 'setting key');
    // Synchronous read from cache
    return this.cache.hasOwnProperty(key) ? this.cache[key] : null;
  }

  async set(key, value, auditContext = null) {
    key = requireLiteralString(key, 'setting key');
    const previousValue = auditContext && Object.prototype.hasOwnProperty.call(auditContext, 'previousValue')
      ? auditContext.previousValue
      : this.get(key);
    if (value === '' && EMPTY_ALLOWED_SETTINGS.has(key)) {
      this.cache[key] = '';
      await dbConnect();
      await Setting.findOneAndUpdate({ key }, { value: '' }, { upsert: true });
      await recordAuditEntry(auditContext, key, previousValue, '');
      return;
    }

    value = requireString(value, 'setting value');
    // Update cache immediately
    this.cache[key] = value;
    // Persist to DB asynchronously
    await dbConnect();
    await Setting.findOneAndUpdate({ key }, { value }, { upsert: true });
    await recordAuditEntry(auditContext, key, previousValue, value);
  }

  // Batched write for a section's Save button: N single-key changes committed
  // together. Validation happens up front and synchronously for the whole
  // array — a malformed entry throws before any DB write is attempted, so
  // the caller (the bulk-set handler) can turn it into a clean 400 rather
  // than a partially-applied save. Once past validation, writes are
  // best-effort per key (Promise.allSettled, not abort-on-first-failure):
  // each Setting.findOneAndUpdate is already independently atomic and there
  // is no rollback available either way, so continuing the rest of the batch
  // after one field's write fails is strictly more useful than stopping.
  async setMany(changes, auditContext = null) {
    const validated = changes.map(({ key, value }) => {
      const validKey = requireLiteralString(key, 'setting key');
      if (value === '' && EMPTY_ALLOWED_SETTINGS.has(validKey)) {
        return { key: validKey, value: '' };
      }
      return { key: validKey, value: requireString(value, 'setting value') };
    });

    // Captured before any writes, so a field's previousValue reflects the
    // pre-batch state even if another field in the same batch writes first.
    const previousValues = Object.fromEntries(validated.map(({ key }) => [key, this.get(key)]));

    await dbConnect();
    const results = await Promise.allSettled(validated.map(async ({ key, value }) => {
      await Setting.findOneAndUpdate({ key }, { value }, { upsert: true });
      this.cache[key] = value;
      return value;
    }));

    const values = {};
    const errors = {};
    const auditEntries = [];
    results.forEach((result, index) => {
      const { key } = validated[index];
      if (result.status === 'fulfilled') {
        values[key] = result.value;
        if (previousValues[key] !== result.value) {
          auditEntries.push({ settingKey: key, previousValue: previousValues[key], newValue: result.value });
        }
      } else {
        errors[key] = result.reason?.message || String(result.reason);
      }
    });

    await recordAuditEntryBatch(auditContext, auditEntries);
    return { values, errors };
  }

  toBoolean(value, defaultValue = true) {
    if (value === undefined || value === null || value === '') return defaultValue;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    const normalized = String(value).trim().toLowerCase();
    if (!normalized) return defaultValue;
    if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
    if (['false', '0', 'no', 'off'].includes(normalized)) return false;
    return defaultValue;
  }
}

export const SettingsService = new SettingsServiceClass();
