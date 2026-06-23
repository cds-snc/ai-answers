import dbConnect from '../api/db/db-connect.js';
import { Setting } from '../models/setting.js';
import { requireLiteralString, requireString } from '../api/util/db-query.js';

// Default values for settings that must always exist.
// Seeded on startup if missing from the database.
const SETTING_DEFAULTS = {
  'model.default': 'openai-gpt51',
  'chat.transport': 'sse',
  'guardrail.indigenousLanguageBlocking': 'true',
  'systemHealth.enabled': 'false',
  'systemHealth.checks.database.enabled': 'true',
  'systemHealth.checks.search.enabled': 'true',
  'systemHealth.checks.llm.enabled': 'true',
  'systemHealth.failureThreshold': '5',
  'systemHealth.failureWindowMinutes': '5',
  'systemHealth.intervalMinutes': '1',
  'systemHealth.alertRecipients': '',
  'systemHealth.alertTemplateId': '',
  'connectivity.simulation.database': 'false',
  'connectivity.simulation.search': 'false',
  'connectivity.simulation.llm': 'false',
};

const EMPTY_ALLOWED_SETTINGS = new Set([
  'systemHealth.alertRecipients',
  'systemHealth.alertTemplateId',
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

  async set(key, value) {
    key = requireLiteralString(key, 'setting key');
    if (value === '' && EMPTY_ALLOWED_SETTINGS.has(key)) {
      this.cache[key] = '';
      await dbConnect();
      await Setting.findOneAndUpdate({ key }, { value: '' }, { upsert: true });
      return;
    }

    value = requireString(value, 'setting value');
    // Update cache immediately
    this.cache[key] = value;
    // Persist to DB asynchronously
    await dbConnect();
    await Setting.findOneAndUpdate({ key }, { value }, { upsert: true });
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
