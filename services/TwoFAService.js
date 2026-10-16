import crypto from 'crypto';
import GCNotifyService from './GCNotifyService.js';
import { User } from '../models/user.js';
import ServerLoggingService from './ServerLoggingService.js';
import { SettingsService } from './SettingsService.js';
import { requireObjectIdString } from '../api/util/db-query.js';
import { normalizeTwoFACode, TWOFA_CODE_LENGTH } from '../src/utils/auth/twoFACode.js';

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

// Any server-only secret works as the HMAC key. JWT_SECRET_KEY is last because it
// is the one every environment has: staging/production (ECS) and PR previews
// (Lambda, which gets no SESSION_SECRET). The "twofa:" prefix keeps these hashes
// distinct from anything else signed with the same key.
function hashCode(userId, code) {
  const key = process.env.TWOFA_SECRET || process.env.SESSION_SECRET || process.env.JWT_SECRET_KEY;
  if (!key) throw codedError('twofa_no_secret', 'TWOFA_SECRET, SESSION_SECRET or JWT_SECRET_KEY must be set to use 2FA');
  return crypto.createHmac('sha256', key).update(`twofa:${userId}:${code}`).digest('hex');
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

function loadUser(userId) {
  return User.findById(requireObjectIdString(userId, 'user ID'));
}

// Send a new code. Pass exactly one of `user` (a full user document read in
// this request: the login step hands over the one Passport just read) or
// `userId` (read fresh here). `resend: true` (the "send again" button)
// enforces the cooldown; the first send right after a correct password does not.
async function sendChallenge({ user: givenUser, userId, resend = false } = {}) {
  if ((givenUser == null) === (userId == null)) {
    throw new Error('sendChallenge needs exactly one of user or userId');
  }
  if (givenUser != null && !givenUser._id) {
    throw new Error('sendChallenge user must be a user document');
  }
  const user = givenUser ?? await loadUser(userId);
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

  const code = String(crypto.randomInt(0, 10 ** TWOFA_CODE_LENGTH)).padStart(TWOFA_CODE_LENGTH, '0');
  const codeHash = hashCode(user._id, code);

  // Email first, store after. If the send fails, the code already in the
  // user's inbox keeps working and no cooldown starts for a code that never arrived.
  // Personalisation expected by the 2FA template: name (blank) and verify_code.
  const res = await GCNotifyService.sendEmail({
    email: user.email,
    personalisation: { name: '', verify_code: code },
    templateId,
  });
  if (!res?.success) return { success: false, reason: 'send_failed' };

  await User.updateOne({ _id: user._id }, {
    $set: {
      twoFACode: codeHash,
      twoFAExpires: new Date(now + CODE_TTL_MS),
      twoFALastSentAt: new Date(now),
    },
  });
  return { success: true };
}

// Check a code. Never says which part was wrong beyond locked/invalid.
// On success, also returns the updated user document. Always reads the user
// itself: the pre-checks below must see the current code and lock.
async function verifyChallenge({ userId, code } = {}) {
  // A typo that can't be a code (empty, letters, wrong length, not a string)
  // is not a guess: refused before any database work, so it is never counted.
  const token = normalizeTwoFACode(code);
  if (!token) return { success: false, reason: 'invalid' };

  const user = await loadUser(userId);
  if (!user) return { success: false, reason: 'invalid' };
  if (!isEnabled()) return { success: false, reason: 'twofa_disabled' };

  const now = Date.now();
  if (user.twoFALockedUntil) {
    if (user.twoFALockedUntil.getTime() > now) return { success: false, reason: 'locked' };
    // Lockout over: start fresh. Only clears the exact lock this request saw, so
    // a request working from an older read can't zero a count others have since added to.
    await User.updateOne(
      { _id: user._id, twoFALockedUntil: user.twoFALockedUntil },
      { $set: { twoFALockedUntil: null, twoFAAttempts: 0 } }
    );
  }

  if (!user.twoFACode || !user.twoFAExpires || user.twoFAExpires.getTime() <= now) {
    return { success: false, reason: 'invalid' };
  }

  // Count the attempt first, atomically, so parallel guesses can't beat the cap.
  // The filter re-checks code, expiry and lock on the live document, since
  // `user` may already be out of date.
  const nowDate = new Date(now);
  const counted = await User.findOneAndUpdate(
    {
      _id: user._id,
      twoFACode: { $ne: null },
      twoFAExpires: { $gt: nowDate },
      $or: [{ twoFALockedUntil: null }, { twoFALockedUntil: { $lte: nowDate } }],
    },
    { $inc: { twoFAAttempts: 1 } },
    { new: true }
  );
  if (!counted) return { success: false, reason: 'invalid' };
  if (counted.twoFAAttempts > MAX_ATTEMPTS) return { success: false, reason: 'locked' };

  const matches = safeEqual(counted.twoFACode, hashCode(user._id, token));

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
  return consumed ? { success: true, user: consumed } : { success: false, reason: 'invalid' };
}

const TwoFAService = { sendChallenge, verifyChallenge };

export default TwoFAService;
