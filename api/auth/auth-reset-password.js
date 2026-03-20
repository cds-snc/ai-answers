import dbConnect from '../db/db-connect.js';
import { User } from '../../models/user.js';
import os from 'os';
import speakeasy from 'speakeasy';

const MAX_RESET_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 30;

const resetPasswordHandler = async (req, res) => {
  try {
    const { email, code, newPassword } = req.body || {};

    // Reject invalid inputs early
    if (!email || !code || !newPassword) {
      return res.status(400).json({ success: false, message: 'email, code, and newPassword required' });
    }

    // Reject literal string "undefined" or "null" from client
    if (code === 'undefined' || code === 'null') {
      console.warn(`[auth-reset-password][${os.hostname()}] Received invalid code string`);
      return res.status(400).json({ success: false, message: 'invalid code' });
    }

    await dbConnect();

    const normalizedEmail = String(email).toLowerCase().trim();

    // Read user with resetPasswordSecret
    const user = await User.findOne({ email: normalizedEmail });

    // Generic error for user-not-found and no-secret to prevent enumeration
    if (!user || !user.resetPasswordSecret) {
      console.warn(`[auth-reset-password][${os.hostname()}] Reset rejected: user not found or no secret configured`);
      return res.status(401).json({ success: false, code: 'RESET_INVALID_CODE', message: 'invalid or expired code' });
    }

    // Check timed lockout
    const now = new Date();
    if (user.resetPasswordLockedUntil && user.resetPasswordLockedUntil > now) {
      console.warn(`[auth-reset-password][${os.hostname()}] Reset rejected: account temporarily locked`);
      return res.status(429).json({
        success: false,
        code: 'RESET_LOCKED_OUT',
        message: 'too many failed attempts, please try again later',
      });
    }

    // If lockout has expired, clear the stale lockout state
    if (user.resetPasswordLockedUntil) {
      await User.updateOne(
        { _id: user._id },
        { $set: { resetPasswordAttempts: 0, resetPasswordLockedUntil: null } }
      );
      user.resetPasswordAttempts = 0;
      user.resetPasswordLockedUntil = null;
    }

    console.debug(`[auth-reset-password][${os.hostname()}] Validating TOTP code`);

    // Validate TOTP code
    const isValid = speakeasy.totp.verify({
      secret: user.resetPasswordSecret,
      encoding: 'base32',
      token: code,
      step: 30,
      window: 20 // Allow ~10 minutes window (20 * 30s)
    });

    if (!isValid) {
      // Atomically increment failed attempts to prevent race conditions
      const updated = await User.findOneAndUpdate(
        { _id: user._id, resetPasswordSecret: { $ne: null } },
        { $inc: { resetPasswordAttempts: 1 } },
        { new: true }
      );
      console.warn(`[auth-reset-password][${os.hostname()}] Invalid or expired TOTP code`);

      // If attempts just hit the limit, set a timed lockout
      if (updated && updated.resetPasswordAttempts >= MAX_RESET_ATTEMPTS) {
        const lockedUntil = new Date(Date.now() + LOCKOUT_MINUTES * 60000);
        await User.updateOne(
          { _id: user._id },
          { $set: { resetPasswordLockedUntil: lockedUntil } }
        );
        console.warn(`[auth-reset-password][${os.hostname()}] Account locked out after max failed attempts`);
        return res.status(429).json({
          success: false,
          code: 'RESET_LOCKED_OUT',
          message: 'too many failed attempts, please try again later',
        });
      }

      return res.status(401).json({ success: false, code: 'RESET_INVALID_CODE', message: 'invalid or expired code' });
    }

    console.debug(`[auth-reset-password][${os.hostname()}] TOTP code validated successfully`);

    // Update password and clear reset state
    user.password = newPassword;
    user.resetPasswordSecret = null;
    user.resetPasswordAttempts = 0;
    user.resetPasswordLockedUntil = null;
    await user.save();

    console.info(`[auth-reset-password][${os.hostname()}] Password reset completed successfully`);

    return res.status(200).json({ success: true, message: 'password reset successfully' });
  } catch (err) {
    console.error(`[auth-reset-password][${os.hostname()}] Error:`, err);
    return res.status(500).json({ success: false, error: 'failed to reset password' });
  }
};

export default resetPasswordHandler;
