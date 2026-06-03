import mongoose from 'mongoose';
import dbConnect, {
  getActiveDocumentDbVersion,
  getDocumentDbUri,
  normalizeDocumentDbVersion,
  switchDocumentDbVersion,
} from '../api/db/db-connect.js';
import { Setting } from '../models/setting.js';
import { requireLiteralString, requireString } from '../api/util/db-query.js';

// Default values for settings that must always exist.
// Seeded on startup if missing from the database.
const SETTING_DEFAULTS = {
  'model.default': 'openai-gpt51',
  'chat.transport': 'sse',
  'database.documentdbVersion': '5',
};

const DOCUMENTDB_VERSION_SETTING = 'database.documentdbVersion';

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

    // Seed any required defaults that aren't in the DB yet
    for (const [key, value] of Object.entries(SETTING_DEFAULTS)) {
      if (!this.cache.hasOwnProperty(key)) {
        await this.set(key, value);
        console.log(`[SettingsService] Seeded missing setting: ${key} = ${value}`);
      }
    }

    await this.applyDocumentDbVersionSetting();

    console.log(`[SettingsService] Loaded ${settings.length} settings into cache.`);
  }

  get(key) {
    key = requireLiteralString(key, 'setting key');
    // Synchronous read from cache
    return this.cache.hasOwnProperty(key) ? this.cache[key] : null;
  }

  async set(key, value) {
    key = requireLiteralString(key, 'setting key');
    value = requireString(value, 'setting value');
    if (key === DOCUMENTDB_VERSION_SETTING) {
      value = normalizeDocumentDbVersion(value);
    }
    // Update cache immediately
    this.cache[key] = value;
    // Persist to DB asynchronously
    await dbConnect();
    await Setting.findOneAndUpdate({ key }, { value }, { upsert: true });
    if (key === DOCUMENTDB_VERSION_SETTING) {
      await this.persistDocumentDbVersionToAlternateCluster(value);
      await switchDocumentDbVersion(value);
    }
  }

  async applyDocumentDbVersionSetting() {
    const version = normalizeDocumentDbVersion(this.cache[DOCUMENTDB_VERSION_SETTING]);
    this.cache[DOCUMENTDB_VERSION_SETTING] = version;
    if (version !== getActiveDocumentDbVersion()) {
      await switchDocumentDbVersion(version);
    }
  }

  async persistDocumentDbVersionToAlternateCluster(version) {
    if (process.env.MONGODB_URI) return;

    const activeVersion = getActiveDocumentDbVersion();
    const alternateVersion = activeVersion === '8' ? '5' : '8';
    const activeUri = getDocumentDbUri(activeVersion);
    const alternateUri = getDocumentDbUri(alternateVersion);
    if (!alternateUri || alternateUri === activeUri) return;

    const now = new Date();
    const connection = await mongoose.createConnection(alternateUri, {
      tls: true,
      tlsCAFile: "/app/global-bundle.pem",
      retryWrites: false,
      bufferCommands: false,
      connectTimeoutMS: 60000,
      socketTimeoutMS: 300000,
      serverSelectionTimeoutMS: 60000,
      heartbeatFrequencyMS: 10000,
      minPoolSize: 1,
      maxPoolSize: 5,
    }).asPromise();

    try {
      await connection.collection('settings').updateOne(
        { key: DOCUMENTDB_VERSION_SETTING },
        {
          $set: { value: version, updatedAt: now },
          $setOnInsert: { createdAt: now },
        },
        { upsert: true }
      );
    } finally {
      await connection.close();
    }
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
