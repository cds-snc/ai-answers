import AuthService from './AuthService.js';
import { getApiUrl } from '../utils/apiToUrl.js';

class ScenarioOverrideServiceClass {
  constructor() {
    this.overrideCache = new Map();
    this.listCache = null;
  }

  _isAuthenticated() {
    try {
      return !!AuthService.getUser();
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
    this.listCache = null;
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
      const response = await AuthService.fetchWithAuth(url);
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

  async listOverrides() {
    if (!this._isAuthenticated()) {
      return [];
    }
    if (this.listCache) {
      return this.listCache;
    }
    try {
      const response = await AuthService.fetchWithAuth(getApiUrl('scenario-overrides'));
      if (!response.ok) {
        throw new Error('Failed to load scenario overrides');
      }
      const data = await response.json();
      const overrides = Array.isArray(data?.overrides) ? data.overrides : [];
      this.listCache = overrides;
      overrides.forEach((item) => {
        if (item && typeof item.departmentKey === 'string') {
          this.overrideCache.set(item.departmentKey, item.enabled ? item.overrideText : null);
        }
      });
      return overrides;
    } catch (error) {
      console.error('ScenarioOverrideService listOverrides error:', error);
      this.listCache = [];
      return [];
    }
  }

  async saveOverride({ departmentKey, overrideText, enabled }) {
    if (!departmentKey) {
      throw new Error('departmentKey is required');
    }
    const response = await AuthService.fetchWithAuth(getApiUrl('scenario-overrides'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ departmentKey, overrideText, enabled }),
    });
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(errText || 'Failed to save override');
    }
    const data = await response.json();
    this.overrideCache.set(departmentKey, data.enabled ? data.overrideText : null);
    this.listCache = null;
    return data;
  }

  async deleteOverride(departmentKey) {
    if (!departmentKey) {
      throw new Error('departmentKey is required');
    }
    const delUrl = `${getApiUrl('scenario-overrides')}?departmentKey=${encodeURIComponent(departmentKey)}`;
    const response = await AuthService.fetchWithAuth(delUrl, { method: 'DELETE' });
    if (!response.ok && response.status !== 404) {
      const errText = await response.text();
      throw new Error(errText || 'Failed to delete override');
    }
    this.clearCaches(departmentKey);
  }
}

export const ScenarioOverrideService = new ScenarioOverrideServiceClass();
export default ScenarioOverrideService;
