import crypto from 'crypto';

// Password reset links carry a random token (F6 in docs/plans/auth-hardening.md).
// The database holds only its hash, with an expiry, until the reset succeeds.

// How long a link works after it is sent. Checked when the new password is
// submitted, so it has to cover delivery plus choosing a password. The token
// can't be guessed, so a longer life doesn't make guessing easier.
export const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;

// A plain hash is enough: the token is 32 random bytes, not a guessable secret.
export function hashResetToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function createResetToken() {
  const token = crypto.randomBytes(32).toString('base64url');
  return {
    token,
    tokenHash: hashResetToken(token),
    expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
  };
}

export function resetTokenMatches(token, storedHash) {
  const submitted = Buffer.from(hashResetToken(token), 'hex');
  const stored = Buffer.from(storedHash, 'hex');
  return submitted.length === stored.length && crypto.timingSafeEqual(submitted, stored);
}
