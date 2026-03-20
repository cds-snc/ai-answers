import dbConnect from '../db/db-connect.js';
import { User } from '../../models/user.js';
import os from 'os';
import speakeasy from 'speakeasy';

const MAX_RESET_ATTEMPTS = 5;

const resetPasswordHandler = async (req, res) => {
  try {
    const { email, code, newPassword } = req.body || {};

    // Reject invalid inputs early
    if (!email || !code || !newPassword) {
      return res.status(400).json({ success: false, message: 'email, code, and newPassword required' });
    }

    // Reject literal string "undefined" or "null" from client
    if (code === 'undefined' || code === 'null') {
      console.warn(`[auth-reset-password][${os.hostname()}] Received invalid code string: ${code}`);
      return res.status(400).json({ success: false, message: 'invalid code' });
    }

    await dbConnect();

    const normalizedEmail = String(email).toLowerCase().trim();

    // Read user with resetPasswordSecret
    const user = await User.findOne({ email: normalizedEmail });

    // Generic error for user-not-found and no-secret to prevent enumeration
    if (!user || !user.resetPasswordSecret) {
      if (!user) {
        console.warn(`[auth-reset-password][${os.hostname()}] User not found for email:`, email);
      } else {
        console.warn(`[auth-reset-password][${os.hostname()}] User has no resetPasswordSecret`);
      }
      return res.status(401).json({ success: false, message: 'invalid or expired code' });
    }

    // Check if too many failed attempts — invalidate secret atomically
    if ((user.resetPasswordAttempts || 0) >= MAX_RESET_ATTEMPTS) {
      console.warn(`[auth-reset-password][${os.hostname()}] Too many failed attempts, secret invalidated for: ${email}`);
      await User.updateOne(
        { _id: user._id },
        { $set: { resetPasswordSecret: null, resetPasswordAttempts: 0 } }
      );
      return res.status(401).json({ success: false, message: 'invalid or expired code' });
    }

    console.debug(`[auth-reset-password][${os.hostname()}] Validating TOTP code for: ${email}`);

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
      const attempts = updated?.resetPasswordAttempts || '?';
      console.warn(`[auth-reset-password][${os.hostname()}] Invalid or expired TOTP code (attempt ${attempts}/${MAX_RESET_ATTEMPTS})`);

      // If this increment just hit the limit, invalidate the secret now
      if (updated && updated.resetPasswordAttempts >= MAX_RESET_ATTEMPTS) {
        await User.updateOne(
          { _id: user._id },
          { $set: { resetPasswordSecret: null, resetPasswordAttempts: 0 } }
        );
        console.warn(`[auth-reset-password][${os.hostname()}] Max attempts reached, secret invalidated for: ${email}`);
      }

      return res.status(401).json({ success: false, message: 'invalid or expired code' });
    }

    console.debug(`[auth-reset-password][${os.hostname()}] TOTP code validated successfully`);

    // Update password and clear reset state
    user.password = newPassword;
    user.resetPasswordSecret = null;
    user.resetPasswordAttempts = 0;
    await user.save();

    console.info(`[auth-reset-password][${os.hostname()}] Password updated successfully for: ${email}`);

    return res.status(200).json({ success: true, message: 'password reset successfully' });
  } catch (err) {
    console.error(`[auth-reset-password][${os.hostname()}] Error:`, err);
    return res.status(500).json({ success: false, error: 'failed to reset password' });
  }
};

export default resetPasswordHandler;
