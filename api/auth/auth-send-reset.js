import dbConnect from '../db/db-connect.js';
import { User } from '../../models/user.js';
import GCNotifyService from '../../services/GCNotifyService.js';
import { SettingsService } from '../../services/SettingsService.js';
import crypto from 'crypto';
import os from 'os';

const sendResetHandler = async (req, res) => {
  try {
    const { email } = req.body || {};
    if (!email) {
      // Always return generic message to avoid user enumeration
      return res.status(200).json({ success: true, message: 'If that account exists, we sent a reset email.' });
    }

    await dbConnect();

    // Generate single-use token and expiry (15 minutes)
    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 15 * 60 * 1000);

    // Store only a hash of the token in the database for security
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    console.debug(`[auth-send-reset][${os.hostname()}] Processing reset request for: ${email}`);
    console.debug(`[auth-send-reset][${os.hostname()}] Generated hash for storage: ${tokenHash}`);
    console.debug(`[auth-send-reset][${os.hostname()}] Expiry set to: ${expires.toISOString()}`);

    // Use findOneAndUpdate to ensure atomic update and avoid stale loaded documents overwriting on .save()
    const user = await User.findOneAndUpdate(
      { email: String(email).toLowerCase().trim() },
      {
        $set: {
          resetPasswordToken: tokenHash,
          resetPasswordExpires: expires
        }
      },
      { new: true }
    );

    if (!user) {
      // Generic response for security
      console.warn(`[auth-send-reset][${os.hostname()}] No user found with email: ${email}`);
      return res.status(200).json({ success: true, message: 'If that account exists, we sent a reset email.' });
    }

    console.info(`[auth-send-reset][${os.hostname()}] User token updated atomically.`);

    // Compose reset link (client will have a route to handle verification)
    let configuredBase = '';
    try {
      configuredBase = SettingsService.get('site.baseUrl') || process.env.FRONTEND_URL || '';
    } catch (e) {
      configuredBase = process.env.FRONTEND_URL || '';
    }
    const normalizedBase = String(configuredBase || '').replace(/\/$/, '');
    const linkPath = `/en/reset-verify?email=${encodeURIComponent(user.email)}&token=${encodeURIComponent(token)}`;
    const resetLink = normalizedBase ? `${normalizedBase}${linkPath}` : linkPath;

    console.debug(`[auth-send-reset][${os.hostname()}] Final Reset Link: ${resetLink}`);

    const tpl = SettingsService.get('notify.resetTemplateId') || process.env.GC_NOTIFY_RESET_TEMPLATE_ID || null;
    const personalisation = {
      name: user.email || '',
      reset_link: resetLink
    };

    if (tpl) {
      try {
        await GCNotifyService.sendEmail({ email: user.email, personalisation, templateId: tpl });
      } catch (e) {
        console.error(`[auth-send-reset][${os.hostname()}] Failed to send email via GC Notify:`, e);
      }
    } else {
      console.error(`[auth-send-reset][${os.hostname()}] Reset template ID missing.`);
    }

    return res.status(200).json({ success: true, message: 'If that account exists, we sent a reset email.' });
  } catch (err) {
    console.error(`[auth-send-reset][${os.hostname()}] Handler error:`, err);
    return res.status(500).json({ success: false, error: 'failed to request reset' });
  }
};

export default sendResetHandler;
