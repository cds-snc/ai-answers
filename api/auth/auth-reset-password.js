import dbConnect from '../db/db-connect.js';
import { User } from '../../models/user.js';
import TwoFAService from '../../services/TwoFAService.js';
import { SettingsService } from '../../services/SettingsService.js';
import ServerLoggingService from '../../services/ServerLoggingService.js';
import crypto from 'crypto';

const resetPasswordHandler = async (req, res) => {
  try {
    const { email, token, code, password } = req.body || {};
    if (!email || !token || !password) return res.status(400).json({ success: false, message: 'email, token and password required' });

    await dbConnect();
    const user = await User.findOne({ email: String(email).toLowerCase().trim() });
    if (!user) return res.status(404).json({ success: false, message: 'user not found' });

    // Validate reset token by comparing stored hash with hash of provided token
    if (!user.resetPasswordToken || !user.resetPasswordExpires || user.resetPasswordExpires < new Date()) {
      return res.status(400).json({ success: false, message: 'invalid or expired token' });
    }
    const tokenHash = crypto.createHash('sha256').update(String(token)).digest('hex');
    let tokenMatches = false;
    try {
      const a = Buffer.from(String(user.resetPasswordToken), 'hex');
      const b = Buffer.from(tokenHash, 'hex');
      if (a.length === b.length && crypto.timingSafeEqual(a, b)) tokenMatches = true;
    } catch (e) {
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
    await user.save();

    // Optionally: revoke sessions — not fully implemented because sessions are in-memory/service-scoped
    try {
      ServerLoggingService.info('Password reset completed for user', 'auth-reset', { user: user._id });
    } catch (e) { }

    // Send security notification email informing password changed
    try {
      const tpl = SettingsService.get('notify.resetTemplateId') || process.env.GC_NOTIFY_RESET_TEMPLATE_ID || null;
      const personalisation = {
        name: user.email || '',
        // Template implementer may want a different template for success notifications; we reuse the same if available
      };
      if (tpl) {
        // send a simple notification (re-using template) — template should be configured appropriately
        await (await import('../../services/GCNotifyService.js')).default.sendEmail({ email: user.email, personalisation, templateId: tpl });
      }
    } catch (e) {
      // don't fail the reset if notification fails
      console.error('failed to send post-reset notification', e);
    }

    return res.status(200).json({ success: true, message: 'password reset' });
  } catch (err) {
    console.error('reset-password handler error', err);
    return res.status(500).json({ success: false, error: 'failed to reset password' });
  }
};

export default resetPasswordHandler;
