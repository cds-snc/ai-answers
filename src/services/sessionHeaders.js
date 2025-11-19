import AuthService from './AuthService.js';

/**
 * Returns authorization and session-bypass headers when an authenticated
 * user token is available. Public users (no token) get an empty object so
 * session enforcement still applies.
 */
export function getSessionBypassHeaders() {
  try {
    const authHeader = AuthService?.getAuthHeader ? AuthService.getAuthHeader() : {};
    const user = AuthService?.getUser ? AuthService.getUser() : null;
    if (!user || user.role !== 'admin') return {};
    if (authHeader && typeof authHeader.Authorization === 'string' && authHeader.Authorization.trim()) {
      return {
        ...authHeader,
        'x-session-bypass': '1',
      };
    }
  } catch (e) {
    // Ignore storage/read failures and fall back to no extra headers
  }
  return {};
}

export default getSessionBypassHeaders;
