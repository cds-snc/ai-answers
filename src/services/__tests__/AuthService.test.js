import { describe, it, beforeEach, afterEach, expect, vi } from 'vitest';

// Mock the api URL helper used by AuthService so calls are predictable
vi.mock('../../utils/apiToUrl.js', () => ({
  getApiUrl: () => '/api/user/user-auth-logout'
}));

import AuthService from '../AuthService.js';

class FakeStorage {
  constructor(initial = {}) {
    this.store = { ...initial };
    this.removed = [];
    this.cleared = false;
  }
  getItem(k) { return Object.prototype.hasOwnProperty.call(this.store, k) ? this.store[k] : null; }
  setItem(k, v) { this.store[k] = v; }
  removeItem(k) { delete this.store[k]; this.removed.push(k); }
  clear() { this.store = {}; this.cleared = true; }
}

describe('AuthService', () => {
  let origWindow;
  let origDocument;
  let fakeLocal;
  let fakeSession;
  let assignedCookies;
  let origFetch;

  beforeEach(() => {
    // Preserve originals
    origWindow = global.window;
    origDocument = global.document;
    origFetch = global.fetch;

    // Fake storage objects
    fakeLocal = new FakeStorage({ token: 'abc', user: JSON.stringify({ id: 1 }) });
    fakeSession = new FakeStorage({ sessionKey: 'v' });

    // Provide a minimal window object expected by AuthService
    global.window = {
      localStorage: fakeLocal,
      sessionStorage: fakeSession,
      location: { hostname: 'localhost' }
    };
    // AuthService references bare localStorage/sessionStorage in some places
    global.localStorage = fakeLocal;
    global.sessionStorage = fakeSession;

    // Fake document.cookie with setter to capture attempts to expire cookies
    assignedCookies = [];
    let cookieVal = 'a=1; b=2';
    global.document = {};
    Object.defineProperty(global.document, 'cookie', {
      configurable: true,
      get: () => cookieVal,
      set: (v) => { assignedCookies.push(v); cookieVal = v; }
    });

    // Mock fetch
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
  });

  afterEach(() => {
    // Restore
    global.window = origWindow;
    global.document = origDocument;
    global.fetch = origFetch;
    vi.resetAllMocks();
  });

  it('removeToken should remove token and user from localStorage', () => {
    AuthService.removeToken();
    expect(fakeLocal.removed).toContain('token');
    expect(fakeLocal.removed).toContain('user');
  });

  it('clearClientStorage should clear local/session storage and expire cookies', () => {
    // Ensure storages have items
    fakeLocal.setItem('keep', 'x');
    fakeSession.setItem('s1', 'y');

    AuthService.clearClientStorage();

    expect(fakeLocal.cleared).toBe(true);
    expect(fakeSession.cleared).toBe(true);
    // document.cookie setter should have been called at least once per cookie
    expect(assignedCookies.length).toBeGreaterThan(0);
    // Each assigned cookie should include an expiry date in the past
    expect(assignedCookies.every(c => /Expires=Thu, 01 Jan 1970/i.test(c))).toBe(true);
  });

  it('logout should call server logout endpoint and clear storage', async () => {
    // Spy on removeToken and clearClientStorage
    const removeSpy = vi.spyOn(AuthService, 'removeToken');
    const clearSpy = vi.spyOn(AuthService, 'clearClientStorage');

    AuthService.logout();

    // fetch is fire-and-forget; ensure it was called with the mocked URL
    expect(global.fetch).toHaveBeenCalled();
    const calledWith = global.fetch.mock.calls[0][0];
    expect(calledWith).toBe('/api/user/user-auth-logout');

    // removeToken and clearClientStorage should be called synchronously
    expect(removeSpy).toHaveBeenCalled();
    expect(clearSpy).toHaveBeenCalled();

    removeSpy.mockRestore();
    clearSpy.mockRestore();
  });
});
