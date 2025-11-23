import AuthService from './AuthService.js';

/**
 * Returns session-bypass header for authenticated admin users.
 * Cookies are sent automatically by the browser, so no need to manually add auth headers.
 */
export async function getSessionBypassHeaders() {
  try {
    const user = await AuthService.getUser();
    if (!user || user.role !== 'admin') return {};

    // Only admin users get session bypass
    return {
      'x-session-bypass': '1',
    };
  } catch (e) {
    // Ignore errors and fall back to no extra headers
  }
  return {};
}

export default getSessionBypassHeaders;
