import dbConnect from '../db/db-connect.js';
import TwoFAService, { CODE_TTL_MS } from '../../services/TwoFAService.js';

// "Send the code again" during sign-in. Acts only on the user who passed the
// password step (req.session.pending2FA). It takes no email from the client, so
// it cannot be used to email arbitrary addresses or to probe for accounts.
const send2FAHandler = async (req, res) => {
  try {
    const pending = req.session?.pending2FA;
    if (!pending || Date.now() - pending.createdAt > CODE_TTL_MS) {
      return res.status(401).json({ success: false, reason: 'invalid' });
    }

    await dbConnect();
    const result = await TwoFAService.sendChallenge({ userOrId: pending.userId, resend: true });

    if (result.reason === 'locked') return res.status(429).json({ success: false, reason: 'locked' });
    if (result.reason === 'cooldown') return res.status(429).json({ success: false, reason: 'cooldown' });
    if (!result.success) return res.status(500).json({ success: false, error: 'failed to send 2fa' });

    // A fresh code gets a fresh window, so the pending marker must not expire first.
    req.session.pending2FA = { ...pending, createdAt: Date.now() };
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('auth-send-2fa handler error', err);
    return res.status(500).json({ success: false, error: 'failed to send 2fa' });
  }
};

export default send2FAHandler;
