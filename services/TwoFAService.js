import GCNotifyService from './GCNotifyService.js';
import { User } from '../models/user.js';
import ServerLoggingService from './ServerLoggingService.js';
import speakeasy from 'speakeasy';
import { SettingsService } from './SettingsService.js';

// When using TOTP we do not store transient codes. We store a per-user secret.

function generateSecret() {
  const secret = speakeasy.generateSecret({ length: 32 });
  return secret.base32; // Return base32 encoded secret for storage
}

async function getTwoFATemplateId(explicitTemplateId) {
  if (explicitTemplateId) return explicitTemplateId;
  const configured = SettingsService.get('twoFA.templateId');
  if (configured && String(configured).trim()) return String(configured).trim();
  return process.env.GC_NOTIFY_2FA_TEMPLATE_ID || null;
}

async function ensureTwoFAEnabled() {
  const enabledSetting = SettingsService.get('twoFA.enabled');
  return SettingsService.toBoolean(enabledSetting, false);
}

async function send2FACode({ userOrId, templateId } = {}) {
  let user = null;
  if (typeof userOrId === 'string' || userOrId instanceof String) {
    user = await User.findById(userOrId);
  } else if (userOrId && userOrId._id) {
    user = userOrId;
  }

  if (!user) {
    throw new Error('User not found');
  }

  if (!user.email) {
    throw new Error('User has no email');
  }

  const twoFAEnabled = await ensureTwoFAEnabled();
  if (!twoFAEnabled) {
    ServerLoggingService.info('2FA disabled; skipping code send', 'twofa-service', { user: user._id });
    return { success: false, reason: 'twofa_disabled' };
  }

  const resolvedTemplateId = await getTwoFATemplateId(templateId);

  if (!resolvedTemplateId) {
    ServerLoggingService.error('GC 2FA template id missing', 'twofa-service');
    throw new Error('GC_NOTIFY_2FA_TEMPLATE_ID missing');
  }

  // Ensure user has a twoFASecret
  if (!user.twoFASecret) {
    user.twoFASecret = generateSecret();
    await user.save();
  }

  const code = speakeasy.totp({
    secret: user.twoFASecret,
    encoding: 'base32'
  });

  if (process.env.NODE_ENV !== 'production') {
    try {
      const masked = user.twoFASecret ? `${String(user.twoFASecret).slice(0, 4)}...${String(user.twoFASecret).slice(-4)}` : '(none)';
      ServerLoggingService.debug(`2FA send timestamp=${new Date().toISOString()} email=${user.email} maskedSecret=${masked} generated=${code}`, 'twofa-service');
    } catch (e) {
      // ignore logging errors
    }
  }

  // Personalisation expected by the 2FA template:
  // Hi ((name)),
  //
  // Here is your verification code to log in to -application name-:
  //
  // ((verify_code)), please update
  const personalisation = {
    // Template expects a name field; leave blank to match notify template expectations
    name: '',
    verify_code: code,
  };

  // Send email via GCNotifyService with explicit templateId
  const res = await GCNotifyService.sendEmail({
    email: user.email,
    personalisation,
    templateId: resolvedTemplateId,
  });

  return { success: res.success, codeSent: code, notifyResponse: res };
}

async function verify2FACode({ userOrId, code } = {}) {
  let user = null;
  if (typeof userOrId === 'string' || userOrId instanceof String) {
    user = await User.findById(userOrId);
  } else if (userOrId && userOrId._id) {
    user = userOrId;
  }

  if (!user) return { success: false, reason: 'not_found' };

  if (!user.twoFASecret) return { success: false, reason: 'no_secret' };

  const twoFAEnabled = await ensureTwoFAEnabled();
  if (!twoFAEnabled) {
    ServerLoggingService.info('2FA disabled; skipping verification', 'twofa-service', { user: user._id });
    return { success: false, reason: 'twofa_disabled' };
  }

  // Sanitize inputs: trim whitespace/newlines which can accidentally appear
  const token = String(code).trim();
  const secret = String(user.twoFASecret).trim();

  // Optional debug logging in non-production to help trace issues (do not log full secret in prod)
  if (process.env.NODE_ENV !== 'production') {
    try {
      const masked = secret ? `${secret.slice(0, 4)}...${secret.slice(-4)}` : '(none)';
      const expected = speakeasy.totp({ secret, encoding: 'base32' });
      ServerLoggingService.debug(`2FA verify timestamp=${new Date().toISOString()} token=${token} expected=${expected} secret=${masked}`, 'twofa-service');
    } catch (e) {
      // ignore logging errors
    }
  }

  const isValid = speakeasy.totp.verify({
    secret: secret,
    encoding: 'base32',
    token: token,
    window: 20 // Allow +/- 20 time steps (~10 minutes) for email delays
  });

  if (!isValid) return { success: false, reason: 'mismatch' };

  return { success: true };
}

const TwoFAService = {
  send2FACode,
  verify2FACode,
};

export default TwoFAService;
