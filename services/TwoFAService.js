import crypto from 'crypto';
import GCNotifyService from './GCNotifyService.js';
import { User } from '../models/user.js';
import ServerLoggingService from './ServerLoggingService.js';
import { SettingsService } from './SettingsService.js';
import { requireObjectIdString } from '../api/util/db-query.js';

// Email one-time codes for the second sign-in step.
//
// Each challenge is a fresh random 6-digit code, stored only as an HMAC with an
// expiry, valid for one successful use. Failed guesses are counted on the user
// document (not the session, which an attacker can throw away) and lock the
// account's 2FA once MAX_ATTEMPTS is reached. See docs/plans/auth-hardening.md.

export const CODE_TTL_MS = 10 * 60 * 1000;
export const MAX_ATTEMPTS = 5;
export const LOCKOUT_MS = 30 * 60 * 1000;
export const RESEND_COOLDOWN_MS = 60 * 1000;

// Errors carry a fixed `code` so the login response can say which step failed
// without sending error text to the browser.
function codedError(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

function hashCode(userId, code) {
  const key = process.env.TWOFA_SECRET || process.env.SESSION_SECRET;
  if (!key) throw codedError('twofa_no_secret', 'TWOFA_SECRET or SESSION_SECRET must be set to use 2FA');
  return crypto.createHmac('sha256', key).update(`${userId}:${code}`).digest('hex');
}

function safeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
}

function isEnabled() {
  return SettingsService.toBoolean(SettingsService.get('twoFA.enabled'), false);
}

function getTemplateId() {
  const configured = SettingsService.get('twoFA.templateId');
  if (configured && String(configured).trim()) return String(configured).trim();
  return process.env.GC_NOTIFY_2FA_TEMPLATE_ID || null;
}

async function loadUser(userOrId) {
  if (userOrId && typeof userOrId === 'object' && userOrId._id) {
    return User.findById(userOrId._id);
  }
  return User.findById(requireObjectIdString(userOrId, 'user ID'));
}

// Send a new code. `resend: true` (the "send again" button) enforces the
// cooldown; the first send right after a correct password does not.
async function sendChallenge({ userOrId, resend = false } = {}) {
  const user = await loadUser(userOrId);
  if (!user) return { success: false, reason: 'not_found' };
  if (!user.email) throw new Error('User has no email');

  if (!isEnabled()) {
    ServerLoggingService.info('2FA disabled; skipping code send', 'twofa-service', { user: user._id });
    return { success: false, reason: 'twofa_disabled' };
  }

  const now = Date.now();
  if (user.twoFALockedUntil && user.twoFALockedUntil.getTime() > now) {
    return { success: false, reason: 'locked' };
  }
  if (resend && user.twoFALastSentAt && now - user.twoFALastSentAt.getTime() < RESEND_COOLDOWN_MS) {
    return { success: false, reason: 'cooldown' };
  }

  const templateId = getTemplateId();
  if (!templateId) {
    ServerLoggingService.error('GC 2FA template id missing', 'twofa-service');
    throw codedError('twofa_no_template', 'GC_NOTIFY_2FA_TEMPLATE_ID missing');
  }

  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  await User.updateOne({ _id: user._id }, {
    $set: {
      twoFACode: hashCode(user._id, code),
      twoFAExpires: new Date(now + CODE_TTL_MS),
      twoFALastSentAt: new Date(now),
    },
  });

  // Personalisation expected by the 2FA template: name (blank) and verify_code.
  const res = await GCNotifyService.sendEmail({
    email: user.email,
    personalisation: { name: '', verify_code: code },
    templateId,
  });
  return { success: !!res?.success };
}

// Check a code. Never says which part was wrong beyond locked/invalid.
async function verifyChallenge({ userOrId, code } = {}) {
  const user = await loadUser(userOrId);
  if (!user) return { success: false, reason: 'invalid' };
  if (!isEnabled()) return { success: false, reason: 'twofa_disabled' };

  const now = Date.now();
  if (user.twoFALockedUntil) {
    if (user.twoFALockedUntil.getTime() > now) return { success: false, reason: 'locked' };
    // Lockout over: start fresh.
    await User.updateOne({ _id: user._id }, { $set: { twoFALockedUntil: null, twoFAAttempts: 0 } });
  }

  if (!user.twoFACode || !user.twoFAExpires || user.twoFAExpires.getTime() <= now) {
    return { success: false, reason: 'invalid' };
  }

  // Count the attempt first, atomically, so parallel guesses can't beat the cap.
  const counted = await User.findOneAndUpdate(
    { _id: user._id },
    { $inc: { twoFAAttempts: 1 } },
    { new: true }
  );
  if (!counted || !counted.twoFACode) return { success: false, reason: 'invalid' };
  if (counted.twoFAAttempts > MAX_ATTEMPTS) return { success: false, reason: 'locked' };

  const token = String(code ?? '').trim();
  const matches = /^\d{6}$/.test(token) && safeEqual(counted.twoFACode, hashCode(user._id, token));

  if (!matches) {
    if (counted.twoFAAttempts >= MAX_ATTEMPTS) {
      await User.updateOne({ _id: user._id }, {
        $set: {
          twoFACode: null,
          twoFAExpires: null,
          twoFAAttempts: 0,
          twoFALockedUntil: new Date(now + LOCKOUT_MS),
        },
      });
      ServerLoggingService.warn('2FA locked after repeated failures', 'twofa-service', { user: user._id });
      return { success: false, reason: 'locked' };
    }
    return { success: false, reason: 'invalid' };
  }

  // Single use: only the request that clears the stored hash wins.
  const consumed = await User.findOneAndUpdate(
    { _id: user._id, twoFACode: counted.twoFACode },
    { $set: { twoFACode: null, twoFAExpires: null, twoFAAttempts: 0 } },
    { new: true }
  );
  return consumed ? { success: true } : { success: false, reason: 'invalid' };
}

const TwoFAService = { sendChallenge, verifyChallenge };

export default TwoFAService;
