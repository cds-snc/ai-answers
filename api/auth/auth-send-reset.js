import dbConnect from '../db/db-connect.js';
import { User } from '../../models/user.js';
import GCNotifyService from '../../services/GCNotifyService.js';
import { SettingsService } from '../../services/SettingsService.js';
import os from 'os';
import { createResetToken } from './reset-token.js';
import { normalizeEmail } from '../../src/utils/auth/validateEmail.js';
import { requireString } from '../util/db-query.js';

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
    // Same normalization as auth-reset-password.js, which looks the user up
    // again from the email in the link.
    const normalizedEmail = normalizeEmail(requireString(email, 'email')).toLowerCase();
    let user = await User.findOne({ email: normalizedEmail });

    if (!user) {
      console.warn(`[auth-send-reset][${os.hostname()}] Reset requested for unknown account`);
      return res.status(200).json({ success: true, message: 'If that account exists, we sent a reset email.' });
    }

    // A new token replaces any earlier one, so older links stop working.
    // One atomic update rather than user.save(), so a stale copy of the user
    // can't overwrite the token.
    const { token, tokenHash, expiresAt } = createResetToken();
    await User.updateOne(
      { _id: user._id },
      { $set: { resetPasswordTokenHash: tokenHash, resetPasswordExpiresAt: expiresAt } }
    );

    console.debug(`[auth-send-reset][${os.hostname()}] Stored new reset token hash`);

    // Compose trusted reset links for both languages; the template decides which to render.
    const frontendUrl = SettingsService.get('site.baseUrl') || process.env.FRONTEND_URL || 'http://localhost:3000';
    const resetLinkEn = buildResetLink(frontendUrl, '/en/reset-complete', normalizedEmail, token);
    const resetLinkFr = buildResetLink(frontendUrl, '/fr/reinitialisation-reussie', normalizedEmail, token);

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
