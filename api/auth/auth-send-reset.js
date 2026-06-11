import dbConnect from '../db/db-connect.js';
import { User } from '../../models/user.js';
import GCNotifyService from '../../services/GCNotifyService.js';
import { SettingsService } from '../../services/SettingsService.js';
import os from 'os';
import speakeasy from 'speakeasy';

function buildResetLink(baseUrl, path, email, code) {
  const normalizedBaseUrl = String(baseUrl || '').replace(/\/+$/, '');
  return `${normalizedBaseUrl}${path}?email=${encodeURIComponent(email)}&code=${encodeURIComponent(code)}`;
}

const sendResetHandler = async (req, res) => {
  try {
    const { email } = req.body || {};
    if (!email) {
      return res.status(400).json({ success: false, message: 'email required' });
    }

    console.debug(`[auth-send-reset][${os.hostname()}] Processing reset request`);

    await dbConnect();

    // Find user — generic response regardless to prevent enumeration
    const normalizedEmail = String(email).toLowerCase().trim();
    let user = await User.findOne({ email: normalizedEmail });

    if (!user) {
      console.warn(`[auth-send-reset][${os.hostname()}] Reset requested for unknown account`);
      return res.status(200).json({ success: true, message: 'If that account exists, we sent a reset email.' });
    }

    // Always generate a fresh secret on each reset request to invalidate prior codes.
    // Do not reset attempt count — preserves lockout across requests to prevent cycling attacks.
    const secret = speakeasy.generateSecret({ length: 32 });
    console.debug(`[auth-send-reset][${os.hostname()}] Generating new resetPasswordSecret for user`);
    user.resetPasswordSecret = secret.base32;
    await user.save();

    // Generate TOTP code from the secret (in-memory, no DB read!)
    const code = speakeasy.totp({
      secret: user.resetPasswordSecret,
      encoding: 'base32',
      step: 30, // 30-second window
      digits: 6
    });

    console.debug(`[auth-send-reset][${os.hostname()}] Generated TOTP code for reset`);

    // Compose trusted reset links for both languages; the template decides which to render.
    const frontendUrl = SettingsService.get('site.baseUrl') || process.env.FRONTEND_URL || 'http://localhost:3000';
    const resetLinkEn = buildResetLink(frontendUrl, '/en/reset-complete', normalizedEmail, code);
    const resetLinkFr = buildResetLink(frontendUrl, '/fr/reinitialisation-reussie', normalizedEmail, code);

    console.debug(`[auth-send-reset][${os.hostname()}] Reset link generated`);

    // Send email via GC Notify
    const templateId = SettingsService.get('notify.resetTemplateId') || process.env.GC_NOTIFY_RESET_TEMPLATE_ID;
    if (!templateId) {
      console.error('[auth-send-reset] Password reset template ID not configured');
      return res.status(500).json({ success: false, error: 'server configuration error' });
    }

    await GCNotifyService.sendEmail({
      email: normalizedEmail,
      templateId,
      personalisation: {
        name: '', // Required by many templates
        reset_link_en: resetLinkEn,
        reset_link_fr: resetLinkFr
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
