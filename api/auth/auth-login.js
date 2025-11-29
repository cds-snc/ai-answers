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

    if (!twoFAEnabled) {
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
        } catch (e) {
          console.warn('Failed to restore visitorId after login', e);
        }

        return res.status(200).json({
          success: true,
          message: 'Login successful',
          user: {
            email: user.email,
            role: user.role,
            active: user.active,
            createdAt: user.createdAt
          }
        });
      });
    } else {
      // Store user temporarily for 2FA verification (don't log in yet)
      req.session.pendingUser = {
        userId: user._id.toString(),
        email: user.email,
        role: user.role
      };

      try {
        const templateId = SettingsService.get('twoFA.templateId');
        const sendResult = await TwoFAService.send2FACode({ userOrId: user, templateId });

        if (!sendResult.success) {
          console.error('TwoFAService failed to send code', sendResult);
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
        return res.status(500).json({
          success: false,
          message: 'Error during login'
        });
      }
    }
  })(req, res, next);
};

export default loginHandler;
