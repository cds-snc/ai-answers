import dbConnect from '../db/db-connect.js';
import { User } from '../../models/user.js';
import { SettingsService } from '../../services/SettingsService.js';
import ServerLoggingService from '../../services/ServerLoggingService.js';
import crypto from 'crypto';
import os from 'os';


const resetPasswordHandler = async (req, res) => {
  try {
    const { email, token, password } = req.body || {};
    if (!email || !token || !password || token === 'undefined' || token === 'null') {
      return res.status(400).json({ success: false, message: 'email, token and password required' });
    }

    await dbConnect();
    const user = await User.findOne({ email: String(email).toLowerCase().trim() }).read('primary');

    if (!user) {
      console.warn(`[auth-reset-password][${os.hostname()}] User not found for email:`, email);
      return res.status(404).json({ success: false, message: 'user not found' });
    }

    // Debug: Log token comparison info (masking token for security in production-like envs if needed, but here we need details)
    const now = new Date();
    const isExpired = user.resetPasswordExpires && user.resetPasswordExpires < now;

    console.debug(`[auth-reset-password][${os.hostname()}] Validating token for:`, email);
    console.debug(`[auth-reset-password][${os.hostname()}] Received token prefix:`, String(token).slice(0, 16), 'length:', String(token).length);
    console.debug(`[auth-reset-password][${os.hostname()}] Stored Token exists:`, !!user.resetPasswordToken);
    console.debug(`[auth-reset-password][${os.hostname()}] Stored Expiry:`, user.resetPasswordExpires);
    console.debug(`[auth-reset-password][${os.hostname()}] Current Time:`, now);
    console.debug(`[auth-reset-password][${os.hostname()}] Is Expired:`, isExpired);

    // Validate reset token by comparing stored hash with hash of provided token
    if (!user.resetPasswordToken || !user.resetPasswordExpires || isExpired) {
      console.warn(`[auth-reset-password][${os.hostname()}] Validation failed: token missing or expired`, {
        hasToken: !!user.resetPasswordToken,
        hasExpiry: !!user.resetPasswordExpires,
        isExpired
      });
      return res.status(400).json({ success: false, message: 'invalid or expired token' });
    }

    const tokenHash = crypto.createHash('sha256').update(String(token)).digest('hex');
    let tokenMatches = false;
    try {
      const a = Buffer.from(String(user.resetPasswordToken), 'hex');
      const b = Buffer.from(tokenHash, 'hex');

      if (a.length === b.length && crypto.timingSafeEqual(a, b)) {
        tokenMatches = true;
      } else {
        console.warn(`[auth-reset-password][${os.hostname()}] Hash mismatch`, {
          storedHashPrefix: String(user.resetPasswordToken).slice(0, 8),
          computedHashPrefix: tokenHash.slice(0, 8),
          aLen: a.length,
          bLen: b.length
        });
      }
    } catch (e) {
      console.error(`[auth-reset-password][${os.hostname()}] crypto comparison error:`, e);
      tokenMatches = false;
    }

    if (!tokenMatches) {
      return res.status(400).json({ success: false, message: 'invalid or expired token' });
    }

    // For password reset via a verified reset link we consider possession of the link sufficient
    // to set a new password. Do not require TOTP at this step. After password change the user
    // will need to sign in normally and provide 2FA if their account requires it.
    // This design choice avoids blocking legitimate users who lost access to their password
    // but still ensures 2FA protects sign-in.

    // Rotate password (User pre-save hashes password)
    user.password = password;
    // Clear reset artifacts
    user.resetPasswordToken = null;
    user.resetPasswordExpires = null;

    try {
      await user.save();
    } catch (saveErr) {
      console.error(`[auth-reset-password][${os.hostname()}] Failed to save user after password update:`, saveErr);
      if (saveErr.name === 'ValidationError') {
        console.error(`[auth-reset-password][${os.hostname()}] Validation Errors:`, saveErr.errors);
      }
      throw saveErr; // Let the outer catch handle it
    }

    // Optionally: revoke sessions — not fully implemented because sessions are in-memory/service-scoped
    try {
      ServerLoggingService.info('Password reset completed for user', 'auth-reset', { user: user._id });
    } catch (e) { }

    // Send security notification email informing password changed
    try {
      const tpl = SettingsService.get('notify.resetTemplateId') || process.env.GC_NOTIFY_RESET_TEMPLATE_ID || null;
      const personalisation = {
        name: user.email || '',
        reset_link: '', // provide empty string to satisfy template requirements if same template is used
      };
      if (tpl) {
        // send a simple notification (re-using template) — template should be configured appropriately
        await (await import('../../services/GCNotifyService.js')).default.sendEmail({ email: user.email, personalisation, templateId: tpl });
      }
    } catch (e) {
      // don't fail the reset if notification fails
      console.error(`[auth-reset-password][${os.hostname()}] failed to send post-reset notification`, e);
    }

    return res.status(200).json({ success: true, message: 'password reset' });
  } catch (err) {
    console.error(`[auth-reset-password][${os.hostname()}] reset-password handler error`, err);
    return res.status(500).json({ success: false, error: 'failed to reset password' });
  }
};

export default resetPasswordHandler;
