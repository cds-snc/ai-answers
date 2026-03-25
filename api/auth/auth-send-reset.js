/**
 * Password reset flow — Step 1 of 2 (this file)
 *
 * 1. User enters their email on ResetRequestPage and submits.
 * 2. This handler (auth-send-reset) generates a per-user TOTP secret,
 *    derives a 6-digit code from it, and emails a reset link via GC Notify:
 *    /{lang}/reset-complete?email={email}&code={code}
 * 3. User clicks the link, landing on ResetCompletePage with email and
 *    code pre-filled from the URL query params.
 * 4. User enters a new password and submits → handled by
 *    auth-reset-password.js (Step 2).
 *
 * Security controls:
 * - Rate limited: 3 requests per 15 min per IP+email (auth-rate-limiter.js)
 * - Fresh TOTP secret generated on each request (invalidates prior codes)
 * - Generic response regardless of whether the email exists
 */
import dbConnect from '../db/db-connect.js';
import { User } from '../../models/user.js';
import GCNotifyService from '../../services/GCNotifyService.js';
import { SettingsService } from '../../services/SettingsService.js';
import os from 'os';
import speakeasy from 'speakeasy';

const sendResetHandler = async (req, res) => {
  try {
    const { email } = req.body || {};
    if (!email) {
      return res.status(400).json({ success: false, message: 'email required' });
    }

    console.debug(`[auth-send-reset][${os.hostname()}] Processing reset request`);

    await dbConnect();

    // Find user — generic response regardless to prevent enumeration
    let user = await User.findOne({ email: String(email).toLowerCase().trim() });

    if (!user) {
      // Generic response for security - don't reveal if user exists
      console.warn(`[auth-send-reset][${os.hostname()}] Reset requested for unknown account`);
      return res.status(200).json({ success: true, message: 'If that account exists, we sent a reset email.' });
    }

    // Always generate a fresh secret on each reset request (invalidates prior codes)
    const secret = speakeasy.generateSecret({ length: 32 });
    console.debug(`[auth-send-reset][${os.hostname()}] Generating new resetPasswordSecret for user`);
    user.resetPasswordSecret = secret.base32;
    user.resetPasswordAttempts = 0;
    await user.save();

    // Generate TOTP code from the secret (in-memory, no DB read!)
    const code = speakeasy.totp({
      secret: user.resetPasswordSecret,
      encoding: 'base32',
      step: 30, // 30-second window
      digits: 6
    });

    console.debug(`[auth-send-reset][${os.hostname()}] Generated TOTP code for reset`);

    // Compose reset link with code
    const frontendUrl = SettingsService.get('site.baseUrl') || process.env.FRONTEND_URL || 'http://localhost:3000';
    const lang = req.body.lang || (req.headers['accept-language']?.includes('fr') ? 'fr' : 'en');
    const resetLink = `${frontendUrl}/${lang}/reset-complete?email=${encodeURIComponent(email)}&code=${code}`;

    console.debug(`[auth-send-reset][${os.hostname()}] Reset link generated`);

    // Send email via GC Notify
    const templateId = SettingsService.get('notify.resetTemplateId') || process.env.GC_NOTIFY_RESET_TEMPLATE_ID;
    if (!templateId) {
      console.error('[auth-send-reset] Password reset template ID not configured');
      return res.status(500).json({ success: false, error: 'server configuration error' });
    }

    await GCNotifyService.sendEmail({
      email,
      templateId,
      personalisation: {
        name: '', // Required by many templates
        reset_link: resetLink
      }
    });

    console.info(`[auth-send-reset][${os.hostname()}] Reset email sent successfully`);
    return res.status(200).json({ success: true, message: 'If that account exists, we sent a reset email.' });
  } catch (err) {
    console.error(`[auth-send-reset][${os.hostname()}] Error:`, err);
    return res.status(500).json({ success: false, error: 'failed to send reset email' });
  }
};

export default sendResetHandler;
