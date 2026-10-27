import crypto from 'crypto';
import { TrustedDevice } from '../models/trustedDevice.js';
import { getCookieOptions } from '../api/util/cookie-utils.js';
import { requireObjectIdString } from '../api/util/db-query.js';

// "Remember this device for 12 hours": after a correct 2FA code, the user can
// skip the code on that browser for REMEMBER_DEVICE_MS. The password is still
// checked every time; auth-login.js asks isRemembered only after it passes.
//
// The cookie holds a random token; the database holds only its hash, tied to
// one user. Using the token does not extend it. See docs/plans/auth-hardening.md.

export const DEVICE_COOKIE = 'aianswers.device';
// Fixed, not a setting: 12 hours is the NIST SP 800-63B AAL2 limit for
// re-authentication, so a setting could only push it past that. Kept here,
// not with TwoFAService's constants, so UserService (which revokes) doesn't
// load GC Notify.
export const REMEMBER_DEVICE_MS = 12 * 60 * 60 * 1000;

// A plain hash is enough: the token is 32 random bytes, not a guessable secret.
function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// Issue a token for this browser and set the cookie on `res`. Same domain
// scoping as the session cookie, so moving between the EN and FR hosts keeps it.
async function remember(req, res, userId) {
  userId = requireObjectIdString(userId, 'user ID');
  const token = crypto.randomBytes(32).toString('base64url');
  const now = Date.now();
  await TrustedDevice.create({
    tokenHash: hashToken(token),
    userId,
    expiresAt: new Date(now + REMEMBER_DEVICE_MS),
  });
  // Keeps the collection small until a TTL index is confirmed on DocumentDB.
  await TrustedDevice.deleteMany({ userId, expiresAt: { $lte: new Date(now) } });
  res.cookie(DEVICE_COOKIE, token, getCookieOptions(req, REMEMBER_DEVICE_MS));
}

// True only for an unexpired token that belongs to this same user: another
// user's token in the same browser does nothing.
async function isRemembered(req, userId) {
  const token = req.cookies?.[DEVICE_COOKIE];
  if (typeof token !== 'string' || !token) return false;
  userId = requireObjectIdString(userId, 'user ID');
  const row = await TrustedDevice.findOne({
    tokenHash: hashToken(token),
    userId,
    expiresAt: { $gt: new Date() },
  }, { _id: 1 }).lean();
  return Boolean(row);
}

// Forget this browser (sign-out): delete its row and clear the cookie. Matched
// by token alone, since the token can only be this browser's own.
async function forget(req, res) {
  const token = req.cookies?.[DEVICE_COOKIE];
  if (typeof token !== 'string' || !token) return;
  // Same domain and path as when it was set, or the browser keeps it.
  const { maxAge, ...options } = getCookieOptions(req);
  res.clearCookie(DEVICE_COOKIE, options);
  await TrustedDevice.deleteOne({ tokenHash: hashToken(token) });
}

// Forget every device for a user: password reset, deactivation, role change, delete.
async function revokeAll(userId) {
  userId = requireObjectIdString(userId, 'user ID');
  await TrustedDevice.deleteMany({ userId });
}

const TrustedDeviceService = { remember, isRemembered, forget, revokeAll };
export default TrustedDeviceService;
