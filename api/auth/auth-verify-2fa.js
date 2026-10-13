import { User } from '../../models/user.js';
import dbConnect from '../db/db-connect.js';
import TwoFAService, { CODE_TTL_MS } from '../../services/TwoFAService.js';
import { SettingsService } from '../../services/SettingsService.js';

// Second step of sign-in. The user is identified only by req.session.pending2FA,
// which auth-login.js sets after a correct password. The request body supplies
// the code and nothing else.
const verify2FAHandler = async (req, res) => {
  try {
    const pending = req.session?.pending2FA;
    if (!pending || Date.now() - pending.createdAt > CODE_TTL_MS) {
      return res.status(401).json({ success: false, reason: 'invalid' });
    }

    const code = req.body?.code;
    if (!code) {
      return res.status(400).json({ success: false, message: 'code required' });
    }

    await dbConnect();

    const result = await TwoFAService.verifyChallenge({ userOrId: pending.userId, code });
    if (!result.success) {
      if (result.reason === 'locked') {
        return res.status(429).json({ success: false, reason: 'locked' });
      }
      return res.status(401).json({ success: false, reason: 'invalid' });
    }

    const user = await User.findById(pending.userId);
    if (!user || !user.active) {
      return res.status(401).json({ success: false, reason: 'invalid' });
    }

    // Preserve visitorId across session regeneration triggered by req.login
    const visitorId = req.session?.visitorId;

    req.login(user, (err) => {
      if (err) {
        console.error('Login after 2FA error:', err);
        return res.status(500).json({ success: false, message: 'Login failed' });
      }

      try {
        if (visitorId) req.session.visitorId = visitorId;

        const sessionTTLSetting = SettingsService.get('session.defaultTTLMinutes') || process.env.SESSION_TTL_MINUTES || '10';
        const authTTLSetting = SettingsService.get('session.authenticatedTTLMinutes') || process.env.SESSION_AUTH_TTL_MINUTES || sessionTTLSetting;
        const parsedAuthMinutes = Number(authTTLSetting);
        const authMinutes = Number.isFinite(parsedAuthMinutes) && parsedAuthMinutes > 0 ? parsedAuthMinutes : 60;

        if (req.session && req.session.cookie) {
          req.session.cookie.maxAge = authMinutes * 60 * 1000;
        }
        delete req.session.pending2FA;
      } catch (e) {
        console.warn('Failed to restore visitorId or set TTL after 2FA login', e);
      }

      return res.status(200).json({
        success: true,
        user: {
          email: user.email,
          role: user.role,
          active: user.active,
          createdAt: user.createdAt
        },
        sessionExpiresAt: req.session?.cookie?.expires ? req.session.cookie.expires.toISOString() : null
      });
    });
  } catch (err) {
    console.error('auth-verify-2fa handler error', err);
    return res.status(500).json({ success: false, error: 'failed to verify 2fa' });
  }
};

export default verify2FAHandler;
