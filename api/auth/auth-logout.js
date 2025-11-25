export default async function logoutHandler(req, res) {
  try {
    // If using express-session, destroy server session
    try {
      if (req && req.session && typeof req.session.destroy === 'function') {
        req.session.destroy(() => { });
      }
    } catch (sessErr) {
      // ignore session destroy errors
    }

    // Expire auth cookies
    const expires = new Date(0).toUTCString();
    const isSecure = process.env.NODE_ENV !== 'development';
    const sameSite = isSecure ? 'strict' : 'lax';
    const secureFlag = isSecure ? 'Secure; ' : '';
    const cookiesToClear = ['access_token', 'refresh_token', 'token', 'session', 'connect.sid'];
    const setCookies = cookiesToClear.map(name => `${name}=; Path=/; Expires=${expires}; HttpOnly; ${secureFlag}SameSite=${sameSite}`);
    // Set multiple Set-Cookie headers
    res.setHeader('Set-Cookie', setCookies);
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('user-auth-logout handler error', err);
    res.status(500).json({ ok: false, error: 'logout failed' });
  }
}
