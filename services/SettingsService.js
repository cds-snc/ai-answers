import dbConnect from '../api/db/db-connect.js';
import { Setting } from '../models/setting.js';

class SettingsServiceClass {
  constructor() {
    this.cache = {};
  }

  async loadAll() {
    await dbConnect();
    const settings = await Setting.find({});
    settings.forEach(s => {
      this.cache[s.key] = s.value;
    });
    console.log(`[SettingsService] Loaded ${settings.length} settings into cache.`);
  }

  get(key) {
    // Synchronous read from cache
    return this.cache.hasOwnProperty(key) ? this.cache[key] : null;
  }

  async set(key, value) {
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
