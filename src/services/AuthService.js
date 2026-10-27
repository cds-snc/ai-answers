import { getApiUrl } from '../utils/apiToUrl.js';
import { ROUTE_SLUGS } from '../utils/routes.js';
import { clearChatOptionChoices } from '../utils/chat/chatOptionsStorage.js';


// POST for the sign-in steps. The login page picks its message from
// err.reason, so every failure gets one: the server's own reason when it sent
// one, 'server_error' for any other 5xx, and 'network' when no response came
// back (offline, VPN dropped). Without these, both would read as a wrong
// password or wrong code. A 4xx with no reason stays null: wrong credentials.
async function postSignInStep(endpoint, body) {
  let response;
  try {
    response = await fetch(getApiUrl(endpoint), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body),
    });
  } catch (cause) {
    const err = new Error(`${endpoint}: no response`);
    err.reason = 'network';
    err.cause = cause;
    throw err;
  }

  if (!response.ok) {
    const json = await response.json().catch(() => ({}));
    const err = new Error(`${endpoint} failed (${response.status})`);
    err.reason = json.reason || (response.status >= 500 ? 'server_error' : null);
    throw err;
  }
  return response.json();
}

class AuthService {
  static unauthorizedCallback = null;
  static currentUser = null; // Cache for current user
  static sessionExpiresAt = null;

  static setUnauthorizedCallback(cb) {
    this.unauthorizedCallback = cb;
  }

  // Consolidated fetch method
  static async fetch(url, options = {}) {
    const method = (options.method || 'GET').toUpperCase();
    const headers = { ...options.headers };

    // Set Content-Type for requests with body
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) && options.body && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }



    // Always include credentials for cookies
    const response = await fetch(url, {
      ...options,
      headers,
      credentials: 'include'
    });

    // Handle 401 - session expired, trigger logout
    if (response.status === 401) {
      this.logout();
      if (typeof this.unauthorizedCallback === 'function') {
        this.unauthorizedCallback();
      }
    }

    return response;
  }





  // Get current user from server
  static async getCurrentUser() {
    try {
      const response = await fetch(getApiUrl('auth-me'), {
        method: 'GET',
        credentials: 'include'
      });

      if (!response.ok) {
        this.currentUser = null;
        this.sessionExpiresAt = null;
        return null;
      }

      const data = await response.json();
      if (data.success && data.user) {
        this.currentUser = data.user;
        this.sessionExpiresAt = data.sessionExpiresAt ? new Date(data.sessionExpiresAt).getTime() : null;
        return data.user;
      }

      this.currentUser = null;
      this.sessionExpiresAt = null;
      return null;
    } catch (error) {
      console.error('getCurrentUser error:', error);
      this.currentUser = null;
      this.sessionExpiresAt = null;
      return null;
    }
  }

  // Get cached user or fetch from server
  static async getUser() {
    if (this.currentUser) {
      return this.currentUser;
    }
    return await this.getCurrentUser();
  }



  // forgetDevice: true only when the user chose to sign out. It also forgets
  // the remembered device; a session that ended on its own keeps it.
  static logout({ forgetDevice = false } = {}) {
    // Clear cached user
    this.currentUser = null;
    this.sessionExpiresAt = null;

    try {
      const logoutUrl = getApiUrl('auth-logout');
      // keepalive: callers navigate away straight after, which would
      // otherwise cancel the request.
      fetch(logoutUrl, {
        method: 'POST',
        credentials: 'include',
        keepalive: true,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ forgetDevice })
      }).catch(() => { });
    } catch (e) {
      // ignore
    }

    this.clearClientStorage();
  }

  // Clear localStorage and sessionStorage (cookies cleared by server)
  static clearClientStorage() {
    try {
      if (typeof window === 'undefined') return;

      try {
        if (window.localStorage) window.localStorage.clear();
      } catch (e) {
        console.warn('localStorage.clear() failed', e);
      }
      try {
        if (window.sessionStorage) window.sessionStorage.clear();
      } catch (e) {
        console.warn('sessionStorage.clear() failed', e);
      }
    } catch (e) {
      console.error('clearClientStorage error', e);
    }
  }

  static async isAuthenticated() {
    const user = await this.getCurrentUser();
    return !!user && user.active !== false;
  }

  static async isAdmin() {
    const user = await this.getUser();
    return !!user && user.role === 'admin';
  }

  static async signup(email, password) {
    const response = await fetch(getApiUrl('auth-signup'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      throw new Error('Signup failed');
    }

    const data = await response.json();
    // Cookies are set automatically by the server
    this.currentUser = data.user;
    this.sessionExpiresAt = data.sessionExpiresAt ? new Date(data.sessionExpiresAt).getTime() : null;
    return data;
  }

  static async login(email, password) {
    const data = await postSignInStep('auth-login', { email, password });
    // If backend indicates twoFA is required, do not cache user yet
    if (data && data.twoFA) {
      return data;
    }

    // Cookies are set automatically by the server
    this.currentUser = data.user;
    this.sessionExpiresAt = data.sessionExpiresAt ? new Date(data.sessionExpiresAt).getTime() : null;
    clearChatOptionChoices();
    return data;
  }

  // rememberDevice: skip the code on this browser for 12 hours (the server
  // sets its own cookie).
  static async verify2FA(code, rememberDevice) {
    // reason: 'invalid' | 'locked' | 'expired' | 'server_error' | 'network'
    const data = await postSignInStep('auth-verify-2fa', { code, rememberDevice });
    // Cookies are set automatically by the server
    if (data.user) {
      this.currentUser = data.user;
      clearChatOptionChoices();
    }
    this.sessionExpiresAt = data.sessionExpiresAt ? new Date(data.sessionExpiresAt).getTime() : null;
    return data;
  }

  // Password reset: request reset link (generic response)
  static async sendReset(email, lang) {
    if (!email) throw new Error('Email required');
    const url = getApiUrl('auth-send-reset');
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, lang })
    });
    if (!resp.ok) {
      const json = await resp.json().catch(() => ({}));
      throw new Error(json.message || 'Failed to send reset');
    }
    return await resp.json();
  }

  // Finalize password reset: provide code (TOTP) and new password
  static async resetPassword({ email, code, password }) {
    const url = getApiUrl('auth-reset-password');
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, code, newPassword: password })
    });
    if (!resp.ok) {
      const json = await resp.json().catch(() => ({}));
      const err = new Error(json.message || 'Failed to reset password');
      err.code = json.code || null;
      throw err;
    }
    return await resp.json();
  }

  // Send the 2FA code again. The server knows who is signing in from the session.
  static async send2FA() {
    // reason: 'cooldown' | 'locked' | 'expired' | 'send_failed' | 'server_error' | 'network'
    return postSignInStep('auth-send-2fa', {});
  }

  static isPublicRoute(pathname) {
    const publicRouteNames = ['signin', 'about', 'system-card', 'register', 'logout', 'reset-request', 'reset-verify', 'reset-complete'];
    const publicPaths = ['/', '/contact'];
    for (const name of publicRouteNames) {
      const slugs = ROUTE_SLUGS[name];
      if (slugs) {
        for (const [lang, slug] of Object.entries(slugs)) {
          publicPaths.push(`/${lang}/${slug}`);
        }
      }
    }
    return publicPaths.some(route => pathname.startsWith(route));
  }

  static async hasRole(requiredRoles = []) {
    const user = await this.getUser();
    return user && requiredRoles.includes(user.role);
  }

  // Synchronous helper that returns the cached user's id if available.
  // Prefer using `getUser()` when you need to ensure the user is loaded.
  static getUserId() {
    return this.currentUser?.userId ?? null;
  }

  static getSessionExpiresAt() {
    return this.sessionExpiresAt;
  }
}

export default AuthService;
