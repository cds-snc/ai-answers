import isbot from 'isbot';

// Middleware that rejects requests whose User-Agent appears to be a known bot.
// Should run after session and fingerprint presence checks so we still have session data.
export default function botIsBot(req, res, next) {
  try {
    // Disable isbot-based rejection during automated tests
    if (process.env.NODE_ENV === 'test') return next();
    const ua = (req && req.headers && (req.headers['user-agent'] || req.headers['User-Agent'])) || '';
    if (!ua) return next();

    // isbot returns true for known bot user-agents
    if (isbot(ua)) {
      res.statusCode = 403;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ error: 'botDetected', message: 'Bot User-Agent detected' }));
    }

    return next();
  } catch (e) {
    if (console && console.error) console.error('botIsBot middleware error', e);
    // Fail-open on unexpected errors to avoid blocking legitimate traffic
    return next();
  }
}
