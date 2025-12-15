import { getApiUrl } from '../utils/apiToUrl.js';


class AuthService {
  static unauthorizedCallback = null;
  static currentUser = null; // Cache for current user

  static setUnauthorizedCallback(cb) {
    this.unauthorizedCallback = cb;
  }

  // Consolidated fetch method
  static async fetch(url, options = {}) {
    const method = (options.method || 'GET').toUpperCase();
    const headers = { ...options.headers };

    // Set Content-Type for requests with body
    if (['POST', 'PUT', 'PATCH'].includes(method) && options.body && !headers['Content-Type']) {
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
        return null;
      }

      const data = await response.json();
      if (data.success && data.user) {
        this.currentUser = data.user;
        return data.user;
      }

      this.currentUser = null;
      return null;
    } catch (error) {
      console.error('getCurrentUser error:', error);
      this.currentUser = null;
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



  static logout() {
    // Clear cached user
    this.currentUser = null;

    try {
      const logoutUrl = getApiUrl('auth-logout');
      fetch(logoutUrl, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' }
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
    return data;
  }

  static async login(email, password) {
    const response = await fetch(getApiUrl('auth-login'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      throw new Error('Login failed');
    }

    const data = await response.json();
    // If backend indicates twoFA is required, do not cache user yet
    if (data && data.twoFA) {
      return data;
    }

    // Cookies are set automatically by the server
    this.currentUser = data.user;
    return data;
  }

  static async verify2FA(email, code) {
    const response = await fetch(getApiUrl('auth-verify-2fa'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, code }),
    });

    if (!response.ok) {
      const json = await response.json().catch(() => ({}));
      throw new Error(json.message || json.reason || '2FA verify failed');
    }

    const data = await response.json();
    // Cookies are set automatically by the server
    if (data.user) {
      this.currentUser = data.user;
    }
    return data;
  }

  // Password reset: request reset link (generic response)
  static async sendReset(email) {
    if (!email) throw new Error('Email required');
    const url = getApiUrl('auth-send-reset');
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email })
    });
    if (!resp.ok) {
      const json = await resp.json().catch(() => ({}));
      throw new Error(json.message || 'Failed to send reset');
    }
    return await resp.json();
  }

  // Finalize password reset: provide token (from link), verification code (TOTP or email OTP), and new password
  static async resetPassword({ email, token, password }) {
    const url = getApiUrl('auth-reset-password');
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, token, password })
    });
    if (!resp.ok) {
      const json = await resp.json().catch(() => ({}));
      throw new Error(json.message || 'Failed to reset password');
    }
    return await resp.json();
  }

  // Send a 2FA code to the user's email using the canonical endpoint only.
  static async send2FA(email) {
    if (!email) throw new Error('Email required');

    const url = getApiUrl('auth-send-2fa');
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email }),
    });

    if (!resp.ok) {
      const json = await resp.json().catch(() => ({}));
      throw new Error(json.message || 'Failed to send 2FA');
    }

    return await resp.json();
  }

  static isPublicRoute(pathname) {
    const publicRoutes = ['/', '/signin', '/signup', '/about', '/contact'];
    return publicRoutes.some(route => pathname.startsWith(route));
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
}

export default AuthService;
