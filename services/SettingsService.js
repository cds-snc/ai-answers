import dbConnect from '../api/db/db-connect.js';
import { Setting } from '../models/setting.js';
import { requireLiteralString, requireString } from '../api/util/db-query.js';
import SettingsAuditService from './SettingsAuditService.js';
import { DEFAULT_WORKFLOW } from '../src/config/workflows.js';
import { parseRecipients } from './parseRecipients.js';

// Lightweight "does this look like an email" check — not full RFC 5322
// validation, just enough to catch a typo that would silently break the
// health-alert notify email. Deliberately plain string operations rather
// than a regex: the obvious `/^[^\s@]+@[^\s@]+\.[^\s@]+$/` pattern is
// ambiguous on input like "!@!.!.!.!.!." (both `[^\s@]+` groups can also
// match the literal `.`), which CodeQL flags as a polynomial-time ReDoS
// risk since this runs on admin-supplied input.
const isPlausibleEmail = (value) => {
  const atIndex = value.indexOf('@');
  if (atIndex <= 0 || value.indexOf('@', atIndex + 1) !== -1) return false;
  const local = value.slice(0, atIndex);
  const domain = value.slice(atIndex + 1);
  if (/\s/.test(local) || /\s/.test(domain)) return false;
  const dotIndex = domain.lastIndexOf('.');
  return dotIndex > 0 && dotIndex < domain.length - 1;
};

// Field-specific semantic checks beyond "is a non-empty string" — keyed by
// setting key, returning an error message when invalid or null when fine.
// Kept small and explicit rather than a generic schema system: add an entry
// here only where a genuinely wrong value causes a real downstream failure
// (e.g. SystemHealthMonitor silently failing to email a malformed address),
// not as a blanket validate-everything policy.
//
// TODO: the plumbing (setMany's per-field validation, fieldErrors,
// FeedbackInlineError, ExplanationErrorSummary on SettingsPage) is fully
// wired up and working end to end, but alertRecipients is the only field
// actually using it so far. None of these settings are "required" — the
// point isn't to gate saving on completeness, it's to flag genuine
// formatting problems the admin likely didn't intend: a GC Notify template
// ID that isn't a real UUID (systemHealth.errorTemplateId/alertTemplateId,
// twoFA.templateId, notify.resetTemplateId), a base URL that isn't a real
// URL (site.baseUrl), a threshold/interval that's technically a number but
// nonsensical (e.g. 0 or negative where the field means "every N minutes").
// Extend this map field by field as those get prioritized — don't add a
// generic "required" check, that's not what this is for.
//
// TODO (code-review #9): separately, the pre-batch-save version of this page
// read a value back after every write and clamped it to an allowed set —
// chat.transport to sse|ndjson, workflow.default to WORKFLOW_VALUES,
// session.rateLimitPersistence to memory|redis. That clamping was lost when
// saveAndVerify's readTransform went away; today an out-of-range value for
// any of those three would be stored and cached verbatim. Low real-world
// risk (the UI only ever offers those fields as fixed <select> options, so
// this only matters if something bypasses the UI and calls the API
// directly) but worth restoring the same way as alertRecipients: validate
// and look into whether it's actually reachable before deciding this needs
// fixing versus just documenting as accepted risk.
// Each validator returns null (fine) or { i18nKey, i18nValues } describing
// what's wrong — never a formatted sentence. This is server-side code with
// no access to the admin's UI language, so it can't compose user-facing
// prose itself; the frontend resolves i18nKey through t() in the admin's
// own language before ever displaying it (see SettingsPage.js's
// handleSectionSave). `.message` on the thrown error stays a plain English
// summary for server logs only — never rendered to a user.
// No separate detection for "wrong separator" (e.g. commas instead of
// semicolons) vs. a genuinely malformed address — parseRecipients only
// splits on ';', so a comma-separated list just becomes one unsplit entry
// that fails isPlausibleEmail the same way a typo'd address would. Rather
// than build detection for that, the message itself names both likely
// causes (settings.validation.invalidEmail: "Invalid email or ; spacing").
const FIELD_VALIDATORS = {
  'systemHealth.alertRecipients': (value) => {
    const invalid = parseRecipients(value).some((email) => !isPlausibleEmail(email));
    return invalid ? { i18nKey: 'settings.validation.invalidEmail' } : null;
  },
};

const validateFieldFormat = (key, value) => {
  const result = FIELD_VALIDATORS[key]?.(value);
  if (!result) return;
  const error = new Error(`Invalid value for ${key}: ${result.i18nKey}`);
  error.i18nKey = result.i18nKey;
  error.i18nValues = result.i18nValues;
  throw error;
};

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
    // An explicit auditContext.previousValue always wins — SystemHealthMonitor
    // passes one when it already captured the pre-change value as part of its
    // own logic, before this call. Otherwise, previousValue comes from
    // findOneAndUpdate's own return value (Mongoose defaults to returning the
    // pre-update document) rather than a separate this.get(key) read — a
    // separate read taken before the write is a race: two concurrent set()
    // calls on the same key can each capture the same stale previousValue,
    // since neither has written yet when the other reads. findOneAndUpdate is
    // atomic, so its return value is always the document exactly as it stood
    // immediately before *this* write, regardless of what else is concurrently
    // writing the same key.
    const hasExplicitPreviousValue = auditContext && Object.prototype.hasOwnProperty.call(auditContext, 'previousValue');
    if (value === '' && EMPTY_ALLOWED_SETTINGS.has(key)) {
      this.cache[key] = '';
      await dbConnect();
      const before = await Setting.findOneAndUpdate({ key }, { value: '' }, { upsert: true });
      const previousValue = hasExplicitPreviousValue ? auditContext.previousValue : (before?.value ?? null);
      await recordAuditEntry(auditContext, key, previousValue, '');
      return;
    }

    value = requireString(value, 'setting value');
    validateFieldFormat(key, value);
    // Update cache immediately
    this.cache[key] = value;
    // Persist to DB asynchronously
    await dbConnect();
    const before = await Setting.findOneAndUpdate({ key }, { value }, { upsert: true });
    const previousValue = hasExplicitPreviousValue ? auditContext.previousValue : (before?.value ?? null);
    await recordAuditEntry(auditContext, key, previousValue, value);
  }

  // Batched write for a section's Save button: N single-key changes committed
  // together. Validation is best-effort per key, same as the write phase
  // below — a bad key/value/format doesn't abort the whole batch, it's
  // recorded in `errors` and skipped, so the fields that *are* valid still
  // save. (Earlier versions of this method validated the whole array
  // synchronously up front, so one bad field failed everything with no way
  // to say which field or why — this is the fix for that.)
  async setMany(changes, auditContext = null) {
    const toWrite = [];
    const errors = {};
    for (const { key: rawKey, value: rawValue } of changes) {
      try {
        const key = requireLiteralString(rawKey, 'setting key');
        const value = (rawValue === '' && EMPTY_ALLOWED_SETTINGS.has(key))
          ? ''
          : requireString(rawValue, 'setting value');
        validateFieldFormat(key, value);
        toWrite.push({ key, value });
      } catch (error) {
        // validateFieldFormat's errors carry an i18nKey (and optionally
        // i18nValues) so the frontend can render them in the admin's own
        // language; other errors here (requireString, etc.) don't have a
        // translation yet — errors[rawKey] stays a plain English string for
        // those, same as before. See FIELD_VALIDATORS' comment for why the
        // message itself is never composed here.
        errors[rawKey] = error.i18nKey
          ? (error.i18nValues ? { i18nKey: error.i18nKey, i18nValues: error.i18nValues } : { i18nKey: error.i18nKey })
          : error.message;
      }
    }

    await dbConnect();
    // previousValue comes from findOneAndUpdate's own return value (the
    // pre-update document, Mongoose's default) rather than a separate read
    // taken before this Promise.allSettled runs — a separate read is a race:
    // two fields in different concurrent setMany batches touching the same
    // key could each capture the same stale previousValue, since neither
    // write has landed when either reads. findOneAndUpdate is atomic per
    // document, so its return value is always accurate for *this* write.
    const results = await Promise.allSettled(toWrite.map(async ({ key, value }) => {
      const before = await Setting.findOneAndUpdate({ key }, { value }, { upsert: true });
      this.cache[key] = value;
      return { value, previousValue: before?.value ?? null };
    }));

    const values = {};
    const auditEntries = [];
    results.forEach((result, index) => {
      const { key } = toWrite[index];
      if (result.status === 'fulfilled') {
        const { value, previousValue } = result.value;
        values[key] = value;
        if (previousValue !== value) {
          auditEntries.push({ settingKey: key, previousValue, newValue: value });
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
