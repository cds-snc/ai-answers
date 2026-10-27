import dbConnect from '../db/db-connect.js';
import TwoFAService, { CODE_TTL_MS } from '../../services/TwoFAService.js';
import TrustedDeviceService from '../../services/TrustedDeviceService.js';
import { getSessionTtlMs } from '../../middleware/express-session.js';

// Second step of sign-in. The user is identified only by req.session.pending2FA,
// which auth-login.js sets after a correct password. The request body supplies
// the code and the "remember this device" choice, nothing else.
const verify2FAHandler = async (req, res) => {
  try {
    // 'expired' tells the client to restart at the password step. It reveals
    // nothing about any account: it only describes this browser's session.
    const pending = req.session?.pending2FA;
    if (!pending || Date.now() - pending.createdAt > CODE_TTL_MS) {
      if (req.session) delete req.session.pending2FA;
      return res.status(401).json({ success: false, reason: 'expired' });
    }

    // No format check here: TwoFAService decides what counts as a code, so an
    // empty, malformed or wrong code all get the same 'invalid' answer below.
    const code = req.body?.code;

    await dbConnect();

    const result = await TwoFAService.verifyChallenge({ userId: pending.userId, code });
    if (!result.success) {
      if (result.reason === 'locked') {
        return res.status(429).json({ success: false, reason: 'locked' });
      }
      return res.status(401).json({ success: false, reason: 'invalid' });
    }

    // Removed or deactivated since the password step: back to sign-in, which
    // gives the usual answer for that account. verifyChallenge returns the
    // document it just updated, so no second read is needed.
    const { user } = result;
    if (!user || !user.active) {
      delete req.session.pending2FA;
      return res.status(401).json({ success: false, reason: 'expired' });
    }

    // Preserve visitorId across session regeneration triggered by req.login
    const visitorId = req.session?.visitorId;

    req.login(user, async (err) => {
      if (err) {
        console.error('Login after 2FA error:', err);
        return res.status(500).json({ success: false, message: 'Login failed', reason: 'server_error' });
      }

      try {
        if (visitorId) req.session.visitorId = visitorId;

        if (req.session && req.session.cookie) {
          req.session.cookie.maxAge = getSessionTtlMs(req);
        }
        delete req.session.pending2FA;
      } catch (e) {
        console.warn('Failed to restore visitorId or set TTL after 2FA login', e);
      }

      // Only when the box was ticked. If this fails the user is still signed
      // in; they get a code next time.
      if (req.body?.rememberDevice === true) {
        try {
          await TrustedDeviceService.remember(req, res, user._id);
        } catch (e) {
          console.error('Failed to remember device after 2FA login', e);
        }
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
    return res.status(500).json({ success: false, reason: 'server_error' });
  }
};

export default verify2FAHandler;
