import { getApiUrl } from '../utils/apiToUrl.js';

class AuthService {
  static unauthorizedCallback = null; // <-- Add this

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
    return userStr ? JSON.parse(userStr) : null;
  }

  static removeToken() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  }

  static logout() {
    this.removeToken();
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
      // JWT tokens are in format: header.payload.signature
      // We need to decode the payload to check expiration
      const payload = token.split('.')[1];
      const decoded = JSON.parse(atob(payload));
      
      // Check if exp field exists and token is expired
      if (decoded.exp) {
        const currentTime = Date.now() / 1000;
        return decoded.exp < currentTime;
      }
      return false;
    } catch (error) {
      console.error('Error checking token expiration:', error);
      return true; // If there's an error parsing, assume token is invalid
    }
  }

  static isAdmin() {
    const user = this.getUser();
    return !!user && user.role === 'admin';
  }

  static async signup(email, password) {
    const response = await fetch(getApiUrl('db-auth-signup'), {
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
    const response = await fetch(getApiUrl('db-auth-login'), {
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
    this.setToken(data.token);
    this.setUser(data.user);
    return data;
  }

  static isPublicRoute(pathname) {
    // Define public routes that do not require authentication
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

    // Start with authentication header
    let combinedHeaders = { ...this.getAuthHeader() };

    // Add Content-Type: application/json by default for relevant methods with a body,
    // but only if not already specified in options.headers.
    if (['POST', 'PUT', 'PATCH'].includes(method) && hasBody) {
      if (!(options.headers && options.headers['Content-Type'])) {
        combinedHeaders['Content-Type'] = 'application/json';
      }
    }

    // Merge with any headers passed in options, allowing options.headers to override
    combinedHeaders = { ...combinedHeaders, ...options.headers };

    const response = await fetch(url, { ...options, headers: combinedHeaders });

    if (response.status === 401) {
      this.logout();
      if (typeof this.unauthorizedCallback === 'function') {
        this.unauthorizedCallback(); // Notify context/provider
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