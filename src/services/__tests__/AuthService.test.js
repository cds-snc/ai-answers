import { describe, it, beforeEach, afterEach, expect, vi } from 'vitest';

// Mock the api URL helper used by AuthService so calls are predictable
vi.mock('../../utils/apiToUrl.js', () => ({
  getApiUrl: (endpoint) => `/api/${endpoint}`
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



  it('clearClientStorage should clear local/session storage', () => {
    // Ensure storages have items
    fakeLocal.setItem('keep', 'x');
    fakeSession.setItem('s1', 'y');

    AuthService.clearClientStorage();

    expect(fakeLocal.cleared).toBe(true);
    expect(fakeSession.cleared).toBe(true);
  });

  it('logout should await the server logout endpoint and clear storage', async () => {
    // Spy on clearClientStorage

    const clearSpy = vi.spyOn(AuthService, 'clearClientStorage');
    let resolveLogout;
    global.fetch.mockImplementationOnce(() => new Promise((resolve) => {
      resolveLogout = resolve;
    }));

    const logoutPromise = AuthService.logout();

    await vi.waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    expect(global.fetch).toHaveBeenCalledWith('/api/auth-logout', {
      method: 'POST',
      credentials: 'include',
      cache: 'no-store',
    });
    expect(clearSpy).not.toHaveBeenCalled();

    resolveLogout({ ok: true, status: 200 });
    await logoutPromise;

    // Callers can now navigate knowing the request has completed.
    expect(clearSpy).toHaveBeenCalled();


    clearSpy.mockRestore();
  });

  it('waits for an in-flight auth check before starting login', async () => {
    let resolveAuthCheck;
    global.fetch
      .mockImplementationOnce(() => new Promise((resolve) => {
        resolveAuthCheck = resolve;
      }))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          user: { email: 'new-user@example.com', role: 'admin' },
        }),
      });

    const authCheckPromise = AuthService.getCurrentUser();
    const loginPromise = AuthService.login('new-user@example.com', 'password');

    await vi.waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    const callsBeforeAuthCheckFinished = global.fetch.mock.calls.length;

    resolveAuthCheck({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        user: { email: 'old-user@example.com', role: 'partner' },
      }),
    });
    await Promise.all([authCheckPromise, loginPromise]);

    expect(callsBeforeAuthCheckFinished).toBe(1);
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(global.fetch.mock.calls[0][0]).toBe('/api/auth-me');
    expect(global.fetch.mock.calls[1][0]).toBe('/api/auth-login');
    expect(AuthService.currentUser).toEqual({ email: 'new-user@example.com', role: 'admin' });
  });

  it('waits for login before starting a new auth check', async () => {
    let resolveLogin;
    global.fetch
      .mockImplementationOnce(() => new Promise((resolve) => {
        resolveLogin = resolve;
      }))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          user: { email: 'new-user@example.com', role: 'admin' },
        }),
      });

    const loginPromise = AuthService.login('new-user@example.com', 'password');
    const authCheckPromise = AuthService.getCurrentUser();

    await vi.waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    const callsBeforeLoginFinished = global.fetch.mock.calls.length;

    resolveLogin({
      ok: true,
      status: 200,
      json: async () => ({
        user: { email: 'new-user@example.com', role: 'admin' },
      }),
    });
    await Promise.all([loginPromise, authCheckPromise]);

    expect(callsBeforeLoginFinished).toBe(1);
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(global.fetch.mock.calls[0][0]).toBe('/api/auth-login');
    expect(global.fetch.mock.calls[1][0]).toBe('/api/auth-me');
    expect(AuthService.currentUser).toEqual({ email: 'new-user@example.com', role: 'admin' });
  });

  it('continues queued auth checks after a failed login', async () => {
    global.fetch
      .mockResolvedValueOnce({ ok: false, status: 401 })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          user: { email: 'existing-user@example.com', role: 'partner' },
        }),
      });

    const loginPromise = AuthService.login('wrong-user@example.com', 'wrong-password');
    const authCheckPromise = AuthService.getCurrentUser();

    await expect(loginPromise).rejects.toThrow('Login failed');
    await expect(authCheckPromise).resolves.toEqual({
      email: 'existing-user@example.com',
      role: 'partner',
    });
    expect(global.fetch.mock.calls.map(([url]) => url)).toEqual([
      '/api/auth-login',
      '/api/auth-me',
    ]);
  });
});
