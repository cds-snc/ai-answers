// Pepper for hashing the client-sent visitorId before it is stored in the session.
//
// AIA-019: there is no hardcoded fallback. A public pepper lets anyone with the
// stored hash test guesses for the raw fingerprint offline, so a missing one
// must fail closed. Same pattern as getSecret() in
// services/ConversationIntegrityService.js and resolveSessionSecret() in
// middleware/express-session.js.
//
// Env only, no SettingsService fallback (express-session.js explains why env
// must win). Read lazily, not at import: server.js loads .env after its imports
// run. An unset NODE_ENV counts as deployed.
import crypto from 'crypto';

let cachedPepper = null;

export function getFingerprintPepper() {
  if (cachedPepper) return cachedPepper;
  const configured = process.env.FP_PEPPER;
  if (configured) {
    cachedPepper = configured;
  } else if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
    // Local only: a throwaway pepper that lasts until the process exits.
    cachedPepper = crypto.randomBytes(32).toString('hex');
    if (process.env.NODE_ENV === 'development') {
      console.warn('[fingerprintPepper] FP_PEPPER is not set: using a temporary pepper. Visitor fingerprints will not match after a server restart.');
    }
  } else {
    throw new Error('FP_PEPPER is not set. Refusing to hash visitor fingerprints without it.');
  }
  return cachedPepper;
}

/**
 * Throws when no pepper is available. server.js calls this at startup so a
 * misconfigured deployment fails to boot instead of failing on the first chat.
 */
export function assertFingerprintPepperConfigured() {
  getFingerprintPepper();
}

export function hashVisitorId(visitorId) {
  return crypto.createHmac('sha256', getFingerprintPepper())
    .update(String(visitorId)).digest('hex');
}
