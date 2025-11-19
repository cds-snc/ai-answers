import dbConnect from '../api/db/db-connect.js';
import { ScenarioOverride } from '../models/scenarioOverride.js';

class ScenarioOverrideServiceClass {
  constructor() {
    this.cache = new Map(); // userId -> Map(departmentKey -> override)
  }

  _getUserCache(userId) {
    if (!userId) {
      return null;
    }
    if (!this.cache.has(userId)) {
      const map = new Map();
      map.fullyLoaded = false;
      this.cache.set(userId, map);
    }
    const userCache = this.cache.get(userId);
    if (typeof userCache.fullyLoaded !== 'boolean') {
      userCache.fullyLoaded = false;
    }
    return userCache;
  }

  async getOverridesForUser(userId) {
    if (!userId) {
      return [];
    }
    const userCache = this._getUserCache(userId);
    if (userCache && userCache.fullyLoaded) {
      return Array.from(userCache.values());
    }

    await dbConnect();
    const overrides = await ScenarioOverride.find({ userId }).lean();
    if (userCache) {
      userCache.clear();
      overrides.forEach((item) => {
        userCache.set(item.departmentKey, item);
      });
      userCache.fullyLoaded = true;
    }
    return overrides;
  }

  async getActiveOverride(userId, departmentKey) {
    if (!userId || !departmentKey) {
      return null;
    }
    const userCache = this._getUserCache(userId);
    if (userCache && userCache.has(departmentKey)) {
      const cached = userCache.get(departmentKey);
      return cached && cached.enabled ? cached : null;
    }

    await dbConnect();
    const override = await ScenarioOverride.findOne({ userId, departmentKey }).lean();
    if (userCache) {
      userCache.set(departmentKey, override);
    }
    return override && override.enabled ? override : null;
  }

  async upsertOverride({ userId, departmentKey, overrideText, enabled = true }) {
    if (!userId || !departmentKey) {
      throw new Error('userId and departmentKey are required');
    }
    await dbConnect();

    const payload = {
      overrideText,
      enabled,
    };

    if (overrideText === undefined) {
      delete payload.overrideText;
    }

    const override = await ScenarioOverride.findOneAndUpdate(
      { userId, departmentKey },
      { $set: payload, $setOnInsert: { userId, departmentKey } },
      { new: true, upsert: true, lean: true }
    );

    this.invalidateCache(userId, departmentKey);
    return override;
  }

  async deleteOverride(userId, departmentKey) {
    if (!userId || !departmentKey) {
      throw new Error('userId and departmentKey are required');
    }
    await dbConnect();
    await ScenarioOverride.deleteOne({ userId, departmentKey });
    this.invalidateCache(userId, departmentKey);
  }

  invalidateCache(userId, departmentKey = null) {
    if (!userId) {
      return;
    }
    const userCache = this.cache.get(userId);
    if (!userCache) {
      return;
    }
    if (departmentKey) {
      userCache.delete(departmentKey);
      userCache.fullyLoaded = false;
      return;
    }
    userCache.clear();
    userCache.fullyLoaded = false;
  }
}

export const ScenarioOverrideService = new ScenarioOverrideServiceClass();
