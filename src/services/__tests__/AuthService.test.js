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



  it('clearClientStorage should clear local/session storage', () => {
    // Ensure storages have items
    fakeLocal.setItem('keep', 'x');
    fakeSession.setItem('s1', 'y');

    AuthService.clearClientStorage();

    expect(fakeLocal.cleared).toBe(true);
    expect(fakeSession.cleared).toBe(true);
  });

  it('logout should call server logout endpoint and clear storage', async () => {
    // Spy on clearClientStorage

    const clearSpy = vi.spyOn(AuthService, 'clearClientStorage');

    AuthService.logout();

    // fetch is fire-and-forget; ensure it was called with the mocked URL
    expect(global.fetch).toHaveBeenCalled();
    const calledWith = global.fetch.mock.calls[0][0];
    expect(calledWith).toBe('/api/user/user-auth-logout');

    // removeToken and clearClientStorage should be called synchronously

    expect(clearSpy).toHaveBeenCalled();


    clearSpy.mockRestore();
  });

  // Only a sign-out the user chose forgets the remembered device. keepalive so
  // the page navigating away straight after doesn't cancel the request.
  it('logout sends forgetDevice only when asked, with keepalive', () => {
    AuthService.logout();
    AuthService.logout({ forgetDevice: true });
    const [auto, chosen] = global.fetch.mock.calls.map((c) => c[1]);
    expect(JSON.parse(auto.body)).toEqual({ forgetDevice: false });
    expect(JSON.parse(chosen.body)).toEqual({ forgetDevice: true });
    expect(auto.keepalive).toBe(true);
    expect(chosen.keepalive).toBe(true);
  });

  // A session can end without logout() running (expired while the browser
  // was closed), so sign-in also drops Options choices left from before.
  const savedChoices = { 'aiAnswers.selectedAI': 'azure', 'aiAnswers.workflow': 'GenericWithQAGraph', 'aiAnswers.selectedSearch': 'canadaca' };
  const signedIn = { ok: true, status: 200, json: async () => ({ user: { userId: 'u1', role: 'admin' } }) };

  it('login clears saved chat Options choices and keeps other storage', async () => {
    Object.entries(savedChoices).forEach(([k, v]) => fakeLocal.setItem(k, v));
    global.fetch = vi.fn().mockResolvedValue(signedIn);

    await AuthService.login('admin@example.com', 'pw');

    Object.keys(savedChoices).forEach((k) => expect(fakeLocal.getItem(k)).toBeNull());
    expect(fakeLocal.getItem('token')).toBe('abc');
  });

  it('login keeps saved choices while waiting for the 2FA code, then verify2FA clears them', async () => {
    Object.entries(savedChoices).forEach(([k, v]) => fakeLocal.setItem(k, v));
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ twoFA: true }) });

    await AuthService.login('admin@example.com', 'pw');
    expect(fakeLocal.getItem('aiAnswers.selectedAI')).toBe('azure');

    global.fetch = vi.fn().mockResolvedValue(signedIn);
    await AuthService.verify2FA('123456');
    Object.keys(savedChoices).forEach((k) => expect(fakeLocal.getItem(k)).toBeNull());
  });
});
