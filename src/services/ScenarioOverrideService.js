import AuthService from './AuthService.js';
import { getApiUrl } from '../utils/apiToUrl.js';

class ScenarioOverrideServiceClass {
  constructor() {
    this.overrideCache = new Map();
  }

  _isAuthenticated() {
    try {
      return !!AuthService.currentUser;
    } catch (error) {
      return false;
    }
  }

  clearCaches(departmentKey = null) {
    if (departmentKey) {
      this.overrideCache.delete(departmentKey);
    } else {
      this.overrideCache.clear();
    }
  }

  async getOverrideForDepartment(departmentKey) {
    if (!departmentKey || !this._isAuthenticated()) {
      return null;
    }
    if (this.overrideCache.has(departmentKey)) {
      return this.overrideCache.get(departmentKey);
    }
    try {
      const url = `${getApiUrl('scenario-overrides')}?departmentKey=${encodeURIComponent(departmentKey)}`;
      const response = await AuthService.fetch(url);
      if (!response.ok) {
        if (response.status === 404) {
          this.overrideCache.set(departmentKey, null);
          return null;
        }
        throw new Error(`Failed to load override for ${departmentKey}`);
      }
      const data = await response.json();
      const override = data?.override && data.override.enabled ? data.override.overrideText : null;
      this.overrideCache.set(departmentKey, override);
      return override;
    } catch (error) {
      console.error('ScenarioOverrideService getOverrideForDepartment error:', error);
      this.overrideCache.set(departmentKey, null);
      return null;
    }
  }

  // Full scenario record for one department — default text, current
  // override text, enabled state, and last-saved time — used by the Scenario
  // overrides admin page's single-department editor. Deliberately not cached
  // (unlike getOverrideForDepartment above): that page always
  // wants the freshest state for whichever department is selected, since
  // saving one department can flip another department's enabled state on the
  // server (see disableOtherOverrides in services/ScenarioOverrideService.js).
  async getDepartmentScenario(departmentKey) {
    if (!departmentKey) {
      throw new Error('departmentKey is required');
    }
    const url = `${getApiUrl('scenario-overrides')}?departmentKey=${encodeURIComponent(departmentKey)}`;
    const response = await AuthService.fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to load scenario for ${departmentKey}`);
    }
    const data = await response.json();
    return {
      departmentKey: data?.departmentKey || departmentKey,
      defaultText: data?.defaultText || '',
      overrideText: typeof data?.override?.overrideText === 'string' ? data.override.overrideText : '',
      enabled: Boolean(data?.override?.enabled),
      updatedAt: data?.override?.updatedAt || null,
    };
  }

  // Cheap check for "does this signed-in user have any department's scenario
  // override active right now" — backs the chat-page banner (issue #1048).
  // Bypasses AuthService.fetch's normal caching layer entirely (no
  // overrideCache involved) since the banner needs to notice a
  // save made in another tab; see useActiveScenarioOverride's
  // visibilitychange/focus refetch.
  async getActiveOverrideSummary() {
    if (!this._isAuthenticated()) {
      return null;
    }
    try {
      const url = `${getApiUrl('scenario-overrides')}?activeOnly=true`;
      const response = await AuthService.fetch(url, { cache: 'no-store' });
      if (!response.ok) {
        throw new Error('Failed to load active scenario override');
      }
      const data = await response.json();
      return data?.active || null;
    } catch (error) {
      console.error('ScenarioOverrideService getActiveOverrideSummary error:', error);
      return null;
    }
  }

  // expectedUpdatedAt: the `updatedAt` this caller last loaded for this
  // department (null if it has never seen a saved override here) — lets the
  // server detect a second tab/window having saved this department in the
  // meantime and refuse the write instead of silently clobbering it. See
  // SCENARIO_OVERRIDE_CONFLICT handling below and in
  // services/ScenarioOverrideService.js's upsertOverride.
  async saveOverride({ departmentKey, overrideText, enabled, expectedUpdatedAt = null }) {
    if (!departmentKey) {
      throw new Error('departmentKey is required');
    }
    const response = await AuthService.fetch(getApiUrl('scenario-overrides'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ departmentKey, overrideText, enabled, expectedUpdatedAt }),
    });
    if (!response.ok) {
      if (response.status === 409) {
        const err = new Error('Scenario override was modified elsewhere');
        err.code = 'SCENARIO_OVERRIDE_CONFLICT';
        throw err;
      }
      const errText = await response.text();
      throw new Error(errText || 'Failed to save override');
    }
    const data = await response.json();
    // A save can flip *other* departments' enabled state server-side (see
    // disableOtherOverrides), so a per-department cache patch here isn't
    // enough — clear everything rather than leave another department's
    // cached entry stale.
    this.overrideCache.clear();
    return data;
  }

  async deleteOverride(departmentKey) {
    if (!departmentKey) {
      throw new Error('departmentKey is required');
    }
    const delUrl = `${getApiUrl('scenario-overrides')}?departmentKey=${encodeURIComponent(departmentKey)}`;
    const response = await AuthService.fetch(delUrl, { method: 'DELETE' });
    if (!response.ok && response.status !== 404) {
      const errText = await response.text();
      throw new Error(errText || 'Failed to delete override');
    }
    this.clearCaches(departmentKey);
  }
}

export const ScenarioOverrideService = new ScenarioOverrideServiceClass();
export default ScenarioOverrideService;
