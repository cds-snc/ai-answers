import dbConnect from '../db/db-connect.js';
import { User } from '../../models/user.js';
import GCNotifyService from '../../services/GCNotifyService.js';
import { SettingsService } from '../../services/SettingsService.js';
import os from 'os';
import speakeasy from 'speakeasy';

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

    // Read user with resetPasswordSecret
    const user = await User.findOne({ email: String(email).toLowerCase().trim() });

    if (!user) {
      console.warn(`[auth-reset-password][${os.hostname()}] User not found for email:`, email);
      return res.status(404).json({ success: false, message: 'user not found' });
    }

    if (!user.resetPasswordSecret) {
      console.warn(`[auth-reset-password][${os.hostname()}] User has no resetPasswordSecret`);
      return res.status(400).json({ success: false, message: 'no reset secret configured' });
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
      console.warn(`[auth-reset-password][${os.hostname()}] Invalid or expired TOTP code`);
      return res.status(401).json({ success: false, message: 'invalid or expired code' });
    }

    console.debug(`[auth-reset-password][${os.hostname()}] TOTP code validated successfully`);

    // Update password
    user.password = newPassword;
    await user.save();

    console.info(`[auth-reset-password][${os.hostname()}] Password updated successfully for: ${email}`);

    // Send success notification via GC Notify
    try {
      const templateId = SettingsService.get('notify.resetTemplateId') || process.env.GC_NOTIFY_RESET_TEMPLATE_ID;
      if (templateId) {
        await GCNotifyService.sendEmail({
          email: user.email,
          templateId,
          personalisation: {
            name: '', // Required by many templates
            reset_link: ''
          }
        });
      }
    } catch (notifyError) {
      console.warn(`[auth-reset-password][${os.hostname()}] Failed to send success notification:`, notifyError);
      // Don't fail the request if notification fails
    }

    return res.status(200).json({ success: true, message: 'password reset successfully' });
  } catch (err) {
    console.error(`[auth-reset-password][${os.hostname()}] Error:`, err);
    return res.status(500).json({ success: false, error: 'failed to reset password' });
  }
};

export default resetPasswordHandler;
