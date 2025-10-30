import dbConnect from '../db/db-connect.js';
import { User } from '../../models/user.js';
import GCNotifyService from '../../services/GCNotifyService.js';
import { SettingsService } from '../../services/SettingsService.js';
import crypto from 'crypto';

const sendResetHandler = async (req, res) => {
  try {
    const { email } = req.body || {};
    if (!email) {
      // Always return generic message to avoid user enumeration
      return res.status(200).json({ success: true, message: 'If that account exists, we sent a reset email.' });
    }

    await dbConnect();
    const user = await User.findOne({ email: String(email).toLowerCase().trim() });
    if (!user) {
      // Generic response
      return res.status(200).json({ success: true, message: 'If that account exists, we sent a reset email.' });
    }

  // Generate single-use token and expiry (15 minutes)
  const token = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + 15 * 60 * 1000);

  // Store only a hash of the token in the database for security
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  user.resetPasswordToken = tokenHash;
  user.resetPasswordExpires = expires;
  // Legacy: no email OTP fallback anymore; no per-reset OTP to clear
    await user.save();

    // Compose reset link (client will have a route to handle verification)
    // Prefer configured site.baseUrl setting, fall back to FRONTEND_URL env var
    let configuredBase = '';
    try {
      configuredBase = (await SettingsService.get('site.baseUrl')) || process.env.FRONTEND_URL || '';
    } catch (e) {
      configuredBase = process.env.FRONTEND_URL || '';
    }
    const normalizedBase = String(configuredBase || '').replace(/\/$/, '');
    const linkPath = `/en/reset-verify?email=${encodeURIComponent(user.email)}&token=${encodeURIComponent(token)}`;
    const resetLink = normalizedBase ? `${normalizedBase}${linkPath}` : linkPath;

    // Resolve template id from settings or env
    const tpl = await SettingsService.get('notify.resetTemplateId') || process.env.GC_NOTIFY_RESET_TEMPLATE_ID || null;
    const personalisation = {
      name: user.email || '',
      // The template should include the reset link. The link contains the plaintext token.
      reset_link: resetLink
    };

    if (tpl) {
      try {
        await GCNotifyService.sendEmail({ email: user.email, personalisation, templateId: tpl });
      } catch (e) {
        console.error('Failed to send reset email', e);
        // We still return generic response to caller
      }
    } else {
      console.error('Reset template id missing; not sending email');
    }

    return res.status(200).json({ success: true, message: 'If that account exists, we sent a reset email.' });
  } catch (err) {
    console.error('send-reset handler error', err);
    return res.status(500).json({ success: false, error: 'failed to request reset' });
  }
};

export default sendResetHandler;
