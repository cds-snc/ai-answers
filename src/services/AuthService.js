import { getApiUrl } from '../utils/apiToUrl.js';

class AuthService {
  static unauthorizedCallback = null;

  static decodeTokenPayload(token) {
    if (!token) {
      return null;
    }
    try {
      const payload = token.split('.')[1];
      if (!payload) {
        return null;
      }
      const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
      let decoded;
      if (typeof atob === 'function') {
        decoded = atob(normalized);
      } else if (typeof Buffer !== 'undefined') {
        decoded = Buffer.from(normalized, 'base64').toString('utf-8');
      } else {
        return null;
      }
      return JSON.parse(decoded);
    } catch (error) {
      console.error('decodeTokenPayload error:', error);
      return null;
    }
  }

  static getUserId() {
    const token = this.getToken();
    const payload = this.decodeTokenPayload(token);
    return payload && payload.userId ? payload.userId : null;
  }

  // Send user details (token) with every request, no logout or 401 handling
  static async fetchWithUser(url, options = {}) {
    const token = this.getToken();
    const headers = { ...options.headers };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const method = (options.method || 'GET').toUpperCase();
    if (['POST', 'PUT', 'PATCH'].includes(method) && options.body && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }
    return fetch(url, { ...options, headers });
  }

  static setUnauthorizedCallback(cb) {
    this.unauthorizedCallback = cb;
  }

  static setToken(token) {
    localStorage.setItem('token', token);
  }

  static getToken() {
    return localStorage.getItem('token');
  }

  static setUser(user) {
    localStorage.setItem('user', JSON.stringify(user));
  }

  static getUser() {
    const userStr = localStorage.getItem('user');
    if (!userStr) {
      const fallbackId = this.getUserId();
      return fallbackId ? { userId: fallbackId } : null;
    }
    try {
      const user = JSON.parse(userStr);
      const userId = this.getUserId();
      if (userId && !user.userId) {
        user.userId = userId;
      }
      return user;
    } catch (error) {
      console.error('getUser parse error:', error);
      return null;
    }
  }

  static removeToken() {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
      }
    } catch (e) {
      console.warn('removeToken error', e);
    }
  }

  static logout() {
    this.removeToken();

    try {
      const logoutUrl = getApiUrl('auth-logout');
      fetch(logoutUrl, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' } })
        .catch(() => {});
    } catch (e) {
      // ignore
    }

    this.clearClientStorage();
  }

  // Clear localStorage, sessionStorage and non-HttpOnly cookies.
  // Note: HttpOnly cookies cannot be cleared via JavaScript; they must be cleared by the server.
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

      if (typeof document !== 'undefined' && document.cookie) {
        const cookies = document.cookie.split(';');
        for (const cookie of cookies) {
          const eqPos = cookie.indexOf('=');
          const name = eqPos > -1 ? cookie.substr(0, eqPos).trim() : cookie.trim();
          try {
            document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
            try {
              const hostParts = window.location.hostname.split('.');
              for (let i = 0; i <= hostParts.length - 1; i++) {
                const domain = hostParts.slice(i).join('.');
                document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;domain=${domain}`;
              }
            } catch (domErr) {
              // ignore domain clear errors
            }
          } catch (e) {
            // ignore per-cookie errors
          }
        }
      }
    } catch (e) {
      console.error('clearClientStorage error', e);
    }
  }

  static isAuthenticated() {
    const token = this.getToken();
    const user = this.getUser();

    if (!token || !user || !user.active) {
      return false;
    }

    if (this.isTokenExpired()) {
      this.logout();
      return false;
    }

    return true;
  }

  static isTokenExpired() {
    const token = this.getToken();
    if (!token) {
      return true;
    }

    try {
      const payload = token.split('.')[1];
      const decoded = JSON.parse(atob(payload));

      if (decoded.exp) {
        const currentTime = Date.now() / 1000;
        return decoded.exp < currentTime;
      }
      return false;
    } catch (error) {
      console.error('Error checking token expiration:', error);
      return true;
    }
  }

  static isAdmin() {
    const user = this.getUser();
    return !!user && user.role === 'admin';
  }

  static async signup(email, password) {
    const response = await fetch(getApiUrl('auth-signup'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      throw new Error('Signup failed');
    }

    const data = await response.json();
    this.setToken(data.token);
    this.setUser(data.user);
    return data;
  }

  static async login(email, password) {
    const response = await fetch(getApiUrl('auth-login'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      throw new Error('Login failed');
    }

    const data = await response.json();
    // If backend indicates twoFA is required, do not set token yet
    if (data && data.twoFA) {
      // Return the user info without setting token
      return data;
    }

    // Store token and user for normal flows
    this.setToken(data.token);
    this.setUser(data.user);
    return data;
  }

  static async verify2FA(email, code) {
    const response = await fetch(getApiUrl('auth-verify-2fa'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, code }),
    });

    if (!response.ok) {
      const json = await response.json().catch(() => ({}));
      throw new Error(json.message || json.reason || '2FA verify failed');
    }

    const data = await response.json();
    if (data.token) {
      this.setToken(data.token);
      this.setUser(data.user);
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
      body: JSON.stringify({ email })
    });
    if (!resp.ok) {
      const json = await resp.json().catch(() => ({}));
      throw new Error(json.message || 'Failed to send reset');
    }
    return await resp.json();
  }

  // Request an OTP to be sent for a given reset token
  // Deprecated: OTP fallback removed. Use sendReset to request a link and reset via the link.

  // Finalize password reset: provide token (from link), verification code (TOTP or email OTP), and new password
  static async resetPassword({ email, token, password }) {
    const url = getApiUrl('auth-reset-password');
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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

  static getAuthHeader() {
    const token = this.getToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  static async fetchWithAuth(url, options = {}) {
    const method = (options.method || 'GET').toUpperCase();
    const hasBody = !!options.body;

    let combinedHeaders = { ...this.getAuthHeader() };

    if (['POST', 'PUT', 'PATCH'].includes(method) && hasBody) {
      if (!(options.headers && options.headers['Content-Type'])) {
        combinedHeaders['Content-Type'] = 'application/json';
      }
    }

    combinedHeaders = { ...combinedHeaders, ...options.headers };

    const response = await fetch(url, { ...options, headers: combinedHeaders });

    if (response.status === 401) {
      this.logout();
      if (typeof this.unauthorizedCallback === 'function') {
        this.unauthorizedCallback();
      }
    }

    return response;
  }

  static hasRole(requiredRoles = []) {
    const user = this.getUser();
    return user && requiredRoles.includes(user.role);
  }
}

export default AuthService;
