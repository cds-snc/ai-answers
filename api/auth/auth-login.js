import TwoFAService from '../../services/TwoFAService.js';
import { SettingsService } from '../../services/SettingsService.js';
import passport from '../../config/passport.js';

const loginHandler = (req, res, next) => {
  passport.authenticate('local', async (err, user, info) => {
    if (err) {
      console.error('Login error:', err);
      return res.status(500).json({ success: false, message: 'Error during login' });
    }

    if (!user) {
      return res.status(401).json({
        success: false,
        message: info?.message || 'Invalid credentials'
      });
    }

    // Check if 2FA is enabled
    const enabledSetting = SettingsService.get('twoFA.enabled');
    const twoFAEnabled = SettingsService.toBoolean(enabledSetting, false);
    const isTest = process.env.NODE_ENV === 'test';

    if (!twoFAEnabled || isTest) {
      // Preserve visitorId across session regeneration triggered by req.login
      const visitorId = req.session?.visitorId;

      // Log user in directly using Passport
      req.login(user, (loginErr) => {
        if (loginErr) {
          console.error('Login error:', loginErr);
          return res.status(500).json({ success: false, message: 'Login failed' });
        }

        // Restore visitorId into the (possibly regenerated) session
        try {
          if (visitorId) req.session.visitorId = visitorId;

          // Set authenticated session TTL
          const sessionTTLSetting = SettingsService.get('session.defaultTTLMinutes') || process.env.SESSION_TTL_MINUTES || '60';
          const authTTLSetting = SettingsService.get('session.authenticatedTTLMinutes') || process.env.SESSION_AUTH_TTL_MINUTES || sessionTTLSetting;
          const parsedAuthMinutes = Number(authTTLSetting);
          const authMinutes = Number.isFinite(parsedAuthMinutes) && parsedAuthMinutes > 0 ? parsedAuthMinutes : 60;

          if (req.session && req.session.cookie) {
            req.session.cookie.maxAge = authMinutes * 60 * 1000;
          }
        } catch (e) {
          console.warn('Failed to restore visitorId or set TTL after login', e);
        }

        return res.status(200).json({
          success: true,
          message: 'Login successful',
          user: {
            email: user.email,
            role: user.role,
            active: user.active,
            createdAt: user.createdAt
          },
          sessionExpiresAt: req.session?.cookie?.expires ? req.session.cookie.expires.toISOString() : null
        });
      });
    } else {
      // Password is correct but the user is not logged in yet. The session
      // remembers who passed the password step; auth-verify-2fa and
      // auth-send-2fa act only on this, never on a client-supplied email.
      req.session.pending2FA = {
        userId: user._id.toString(),
        createdAt: Date.now()
      };

      try {
        const sendResult = await TwoFAService.sendChallenge({ userOrId: user });

        if (sendResult.reason === 'locked') {
          delete req.session.pending2FA;
          return res.status(429).json({
            success: false,
            message: 'Too many attempts. Try again later.'
          });
        }

        if (!sendResult.success) {
          console.error('TwoFAService failed to send code', sendResult);
          delete req.session.pending2FA;
          return res.status(500).json({
            success: false,
            message: 'Error during login'
          });
        }

        return res.status(200).json({
          success: true,
          twoFA: true,
          message: '2FA code sent',
          user: {
            email: user.email,
            role: user.role,
            active: user.active,
            createdAt: user.createdAt
          }
        });
      } catch (error) {
        console.error('2FA send error:', error);
        delete req.session.pending2FA;
        return res.status(500).json({
          success: false,
          message: 'Error during login'
        });
      }
    }
  })(req, res, next);
};

export default loginHandler;
