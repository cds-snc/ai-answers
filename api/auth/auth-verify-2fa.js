import dbConnect from '../db/db-connect.js';
import { User } from '../../models/user.js';
import TwoFAService from '../../services/TwoFAService.js';
import { SettingsService } from '../../services/SettingsService.js';

const verify2FAHandler = async (req, res) => {
  try {
    const { email, code } = req.body || {};
    if (!email || !code) {
      return res.status(400).json({ success: false, message: 'email and code required' });
    }

    await dbConnect();
    const user = await User.findOne({ email: String(email).toLowerCase().trim() });
    if (!user) {
      return res.status(404).json({ success: false, message: 'user not found' });
    }

    const enabledSetting = SettingsService.get('twoFA.enabled');
    const twoFAEnabled = SettingsService.toBoolean(enabledSetting, false);
    if (!twoFAEnabled) {
      return res.status(403).json({ success: false, message: 'two-factor authentication disabled' });
    }

    const result = await TwoFAService.verify2FACode({ userOrId: user, code });

    if (result.success) {
      // Preserve visitorId across session regeneration triggered by req.login
      const visitorId = req.session?.visitorId;

      // Log user in using Passport
      req.login(user, (err) => {
        if (err) {
          console.error('Login after 2FA error:', err);
          return res.status(500).json({ success: false, message: 'Login failed' });
        }

        // Restore visitorId into the (possibly regenerated) session
        try {
          if (visitorId) req.session.visitorId = visitorId;

          // Set authenticated session TTL
          const sessionTTLSetting = SettingsService.get('session.defaultTTLMinutes') || process.env.SESSION_TTL_MINUTES || '10';
          const authTTLSetting = SettingsService.get('session.authenticatedTTLMinutes') || process.env.SESSION_AUTH_TTL_MINUTES || sessionTTLSetting;
          const parsedAuthMinutes = Number(authTTLSetting);
          const authMinutes = Number.isFinite(parsedAuthMinutes) && parsedAuthMinutes > 0 ? parsedAuthMinutes : 60;

          if (req.session && req.session.cookie) {
            req.session.cookie.maxAge = authMinutes * 60 * 1000;
          }
        } catch (e) {
          console.warn('Failed to restore visitorId or set TTL after 2FA login', e);
        }

        // Clear pending user from session
        delete req.session.pendingUser;

        return res.status(200).json({
          success: true,
          user: {
            email: user.email,
            role: user.role,
            active: user.active,
            createdAt: user.createdAt
          }
        });
      });
    } else {
      return res.status(401).json({ success: false, reason: result.reason || 'invalid' });
    }
  } catch (err) {
    console.error('user-verify-2fa handler error', err);
    return res.status(500).json({ success: false, error: 'failed to verify 2fa' });
  }
};

export default verify2FAHandler;
