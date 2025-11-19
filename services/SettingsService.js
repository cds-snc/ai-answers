import dbConnect from '../api/db/db-connect.js';
import { Setting } from '../models/setting.js';

class SettingsServiceClass {
  constructor() {
    this.cache = {};
  }

  async get(key) {
    if (this.cache.hasOwnProperty(key)) {
      return this.cache[key];
    }
    await dbConnect();
    const setting = await Setting.findOne({ key });
    const value = setting ? setting.value : null;
    this.cache[key] = value;
    return value;
  }

  async set(key, value) {
    await dbConnect();
    await Setting.findOneAndUpdate({ key }, { value }, { upsert: true });
    this.cache[key] = value;
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
