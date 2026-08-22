import dbConnect from '../api/db/db-connect.js';
import { ScenarioOverride } from '../models/scenarioOverride.js';
import { normalizeLiteralString, normalizeObjectIdString, requireLiteralString, requireObjectIdString } from '../api/util/db-query.js';

class ScenarioOverrideServiceClass {
  constructor() {
    this.cache = new Map(); // userId -> Map(departmentKey -> override)
    // Bumped by every invalidateCache call, any user. getOverridesForUser
    // captures this before its await gap (dbConnect + find) and only
    // commits the read to cache if it hasn't moved — otherwise a concurrent
    // invalidation (a save/delete/disableOtherOverrides landing mid-read)
    // could get silently overwritten by this call's now-stale result,
    // re-marking the cache fullyLoaded with data that's already wrong.
    this._invalidationGeneration = 0;
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
    userId = requireObjectIdString(userId, 'userId');
    const userCache = this._getUserCache(userId);
    if (userCache && userCache.fullyLoaded) {
      return Array.from(userCache.values());
    }

    const generationAtStart = this._invalidationGeneration;
    await dbConnect();
    const overrides = await ScenarioOverride.find({ userId }).lean();
    if (userCache && this._invalidationGeneration === generationAtStart) {
      userCache.clear();
      overrides.forEach((item) => {
        userCache.set(item.departmentKey, item);
      });
      userCache.fullyLoaded = true;
    }
    return overrides;
  }

  // Cache-or-fetch, returning the raw doc (or null) regardless of enabled
  // state — shared by getOverride (any state) and getActiveOverride
  // (enabled-only) below so the enabled filter is applied in exactly one
  // place rather than duplicated across two near-identical DB calls.
  async _getRawOverride(userId, departmentKey) {
    userId = requireObjectIdString(userId, 'userId');
    departmentKey = requireLiteralString(departmentKey, 'departmentKey');
    const userCache = this._getUserCache(userId);
    if (userCache && userCache.has(departmentKey)) {
      return userCache.get(departmentKey);
    }

    await dbConnect();
    const override = await ScenarioOverride.findOne({ userId, departmentKey }).lean();
    if (userCache) {
      userCache.set(departmentKey, override);
    }
    return override;
  }

  // Returns the saved override regardless of enabled state — for callers
  // that need to know "is there a saved draft for this department at all"
  // (the Scenario overrides editor's own GET-by-department route). Do NOT
  // use this for "should this override affect a live answer" — that's
  // getActiveOverride below (enabled-only), which GraphWorkflowHelper.js
  // relies on for exactly that decision.
  async getOverride(userId, departmentKey) {
    if (!userId || !departmentKey) {
      return null;
    }
    return this._getRawOverride(userId, departmentKey);
  }

  async getActiveOverride(userId, departmentKey) {
    if (!userId || !departmentKey) {
      return null;
    }
    const override = await this._getRawOverride(userId, departmentKey);
    return override && override.enabled ? override : null;
  }

  // expectedUpdatedAt implements optimistic concurrency for two tabs/windows
  // editing the same department: pass the `updatedAt` the caller last loaded
  // (or null if they've never seen a saved override for this department).
  // The match is atomic (one findOneAndUpdate, no separate read-then-write),
  // so a second tab racing the same save can't slip through the gap. A
  // mismatch — including "a doc exists when the caller expected none," or
  // "no doc matches that timestamp anymore" — throws a conflict error
  // instead of silently overwriting whatever the other tab just saved; see
  // the SCENARIO_OVERRIDE_CONFLICT handling in api/scenario/scenario-overrides.js.
  async upsertOverride({ userId, departmentKey, overrideText, enabled = true, expectedUpdatedAt = null }) {
    if (!userId || !departmentKey) {
      throw new Error('userId and departmentKey are required');
    }
    userId = requireObjectIdString(userId, 'userId');
    departmentKey = requireLiteralString(departmentKey, 'departmentKey');

    let expectedDate = null;
    if (expectedUpdatedAt != null) {
      expectedDate = new Date(expectedUpdatedAt);
      if (Number.isNaN(expectedDate.getTime())) {
        throw new Error('expectedUpdatedAt must be a valid date');
      }
    }

    await dbConnect();

    const payload = {
      overrideText,
      enabled,
    };

    if (overrideText === undefined) {
      delete payload.overrideText;
    }

    const conflictError = () => {
      const err = new Error('Scenario override was modified elsewhere');
      err.code = 'SCENARIO_OVERRIDE_CONFLICT';
      return err;
    };

    let override;
    if (expectedDate) {
      // Caller has seen a saved override with this exact updatedAt — only
      // apply if that's still the current value on the server.
      override = await ScenarioOverride.findOneAndUpdate(
        { userId, departmentKey, updatedAt: expectedDate },
        { $set: payload },
        { new: true, lean: true }
      );
      if (!override) {
        throw conflictError();
      }
    } else {
      // Caller has never seen a saved override for this department — only
      // create one if that's still true. updatedAt always exists once a doc
      // exists (schema has timestamps: true), so this filter matches zero
      // docs whenever a real one is already there, and upsert then attempts
      // an insert that collides with the unique index below.
      try {
        override = await ScenarioOverride.findOneAndUpdate(
          { userId, departmentKey, updatedAt: { $exists: false } },
          { $set: payload, $setOnInsert: { userId, departmentKey } },
          { new: true, upsert: true, lean: true }
        );
      } catch (error) {
        if (error?.code === 11000) {
          throw conflictError();
        }
        throw error;
      }
    }

    this.invalidateCache(userId, departmentKey);
    return override;
  }

  // Enforces "one active scenario override at a time" per user: when a
  // department is enabled, every other enabled override for that user is
  // turned off. This is a UX/testing-hygiene choice, not a technical
  // requirement — getActiveOverride() is keyed by departmentKey, so multiple
  // enabled overrides would work fine functionally. It exists so a
  // department left enabled from a past test session can't silently keep
  // affecting answers while the person believes they're only testing the one
  // they're currently looking at.
  async disableOtherOverrides(userId, keepDepartmentKey) {
    if (!userId || !keepDepartmentKey) {
      return;
    }
    userId = requireObjectIdString(userId, 'userId');
    keepDepartmentKey = requireLiteralString(keepDepartmentKey, 'departmentKey');
    await dbConnect();
    await ScenarioOverride.updateMany(
      { userId, departmentKey: { $ne: keepDepartmentKey }, enabled: true },
      { $set: { enabled: false } }
    );
    this.invalidateCache(userId);
  }

  async deleteOverride(userId, departmentKey) {
    if (!userId || !departmentKey) {
      throw new Error('userId and departmentKey are required');
    }
    userId = requireObjectIdString(userId, 'userId');
    departmentKey = requireLiteralString(departmentKey, 'departmentKey');
    await dbConnect();
    await ScenarioOverride.deleteOne({ userId, departmentKey });
    this.invalidateCache(userId, departmentKey);
  }

  invalidateCache(userId, departmentKey = null) {
    if (!userId) {
      return;
    }
    userId = normalizeObjectIdString(userId);
    if (!userId) {
      return;
    }
    this._invalidationGeneration++;
    departmentKey = departmentKey ? normalizeLiteralString(departmentKey) : null;
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
