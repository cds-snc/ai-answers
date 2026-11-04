/**
 * Password reset flow — Step 2 of 2 (this file)
 *
 * 1. User clicked the reset link from their email, landing on
 *    ResetCompletePage with email and token (the `code` parameter) from the URL.
 * 2. User enters a new password and submits.
 * 3. This handler hashes the token, compares it with the stored hash and
 *    checks the expiry, then updates the password if valid.
 *
 * See auth-send-reset.js for Step 1 (token generation and email delivery).
 *
 * Security controls:
 * - Token is 32 random bytes, stored only as a hash, with a 30-minute expiry
 * - One generic invalid-code response for every refusal (no enumeration)
 * - Token used up in one atomic write before the password is saved, so a
 *   link works once
 * - Server-side password rule (src/utils/auth/passwordRule.js), checked
 *   before the token so a refused password leaves the link usable
 * - Remembered devices (TrustedDeviceService) forgotten, so each one needs
 *   a 2FA code again
 */
import dbConnect from '../db/db-connect.js';
import { User } from '../../models/user.js';
import os from 'os';
import { meetsPasswordRule } from '../../src/utils/auth/passwordRule.js';
import { normalizeEmail } from '../../src/utils/auth/validateEmail.js';
import { requireString } from '../util/db-query.js';
import TrustedDeviceService from '../../services/TrustedDeviceService.js';
import { resetTokenMatches } from './reset-token.js';

const resetPasswordHandler = async (req, res) => {
  try {
    const { email, code, newPassword } = req.body || {};

    if (!email || !code || !newPassword) {
      return res.status(400).json({ success: false, message: 'email, code, and newPassword required' });
    }

    // Reject literal string "undefined" or "null" for the reset token
    // (e.g. missing ?code= query param on the reset link)
    if (code === 'undefined' || code === 'null') {
      console.warn(`[auth-reset-password][${os.hostname()}] Received invalid request`);
      return res.status(400).json({ success: false, code: 'RESET_INVALID_CODE', message: 'invalid or expired code' });
    }

    if (!meetsPasswordRule(newPassword)) {
      return res.status(400).json({ success: false, code: 'PASSWORD_RULE', message: 'password does not meet the rule' });
    }

    await dbConnect();

    const normalizedEmail = normalizeEmail(requireString(email, 'email')).toLowerCase();
    const token = requireString(code, 'code');
    // Production reads from replicas by default (secondaryPreferred). The
    // token was just written to the primary, so read it from there: a replica
    // that hasn't caught up would refuse a valid link.
    const user = await User.findOne({ email: normalizedEmail }).read('primary');

    // One generic error for every refusal, to prevent enumeration. There is
    // no attempt counter: the token is 32 random bytes, so guessing can't
    // work, and a lockout would only let someone who knows an email address
    // block that person's reset.
    const now = new Date();
    if (!user || !user.resetPasswordTokenHash || !(user.resetPasswordExpiresAt > now)
      || !resetTokenMatches(token, user.resetPasswordTokenHash)) {
      console.warn(`[auth-reset-password][${os.hostname()}] Reset rejected: user not found, no token, wrong token, or token expired`);
      return res.status(401).json({ success: false, code: 'RESET_INVALID_CODE', message: 'invalid or expired code' });
    }

    console.debug(`[auth-reset-password][${os.hostname()}] Reset token validated successfully`);

    // A new password also means a new 2FA code on every remembered device.
    // Done before the token is used up: if this fails, the link still works
    // for a retry, and the cost is one extra code.
    await TrustedDeviceService.revokeAll(user._id.toString());

    // Use up the token in one atomic write that only matches this token, so
    // two submits of the same link can't both succeed, and a newer link sent
    // since the read above is left alone.
    const claimed = await User.findOneAndUpdate(
      { _id: user._id, resetPasswordTokenHash: user.resetPasswordTokenHash },
      { $set: { resetPasswordTokenHash: null, resetPasswordExpiresAt: null } }
    );
    if (!claimed) {
      console.warn(`[auth-reset-password][${os.hostname()}] Reset rejected: token already used or replaced`);
      return res.status(401).json({ success: false, code: 'RESET_INVALID_CODE', message: 'invalid or expired code' });
    }

    // save() hashes the password (pre-save hook) and writes only the fields
    // changed here, so it can't put back the token cleared above. If it
    // fails, the link is used up and the user asks for a new one.
    user.password = newPassword;
    await user.save();

    console.info(`[auth-reset-password][${os.hostname()}] Password reset completed successfully`);

    return res.status(200).json({ success: true, message: 'password reset successfully' });
  } catch (err) {
    console.error(`[auth-reset-password][${os.hostname()}] Error:`, err);
    return res.status(500).json({ success: false, message: 'failed to reset password' });
  }
};

export default resetPasswordHandler;
