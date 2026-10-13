import { RateLimiterMemory } from 'rate-limiter-flexible';

// Loose per-IP backstop on POSTs to /api/auth/*. The real brute-force controls
// are the per-account lockouts in config/passport.js and services/TwoFAService.js,
// which hold no matter how many sessions or addresses an attacker uses.
//
// Deliberately generous and in-memory (per ECS task): signed-in staff reach the
// site through a few shared VPN addresses, so a tight per-IP limit could lock
// everyone out at once.
export const AUTH_RATE_LIMIT_POINTS = 100;
export const AUTH_RATE_LIMIT_WINDOW_SECONDS = 15 * 60;

export function createAuthRateLimiter({
  points = AUTH_RATE_LIMIT_POINTS,
  duration = AUTH_RATE_LIMIT_WINDOW_SECONDS,
} = {}) {
  const limiter = new RateLimiterMemory({ points, duration });

  return async function authRateLimiter(req, res, next) {
    if (req.method !== 'POST') return next();
    try {
      await limiter.consume(req.ip || 'unknown');
      return next();
    } catch (rejection) {
      const retryAfter = Math.max(1, Math.ceil((rejection?.msBeforeNext || 1000) / 1000));
      res.setHeader('Retry-After', String(retryAfter));
      return res.status(429).json({ success: false, message: 'Too many requests' });
    }
  };
}

export default createAuthRateLimiter();
