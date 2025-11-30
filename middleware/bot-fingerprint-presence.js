// Ensures a hashed visitorId is present in the express session.
// If absent, responds with 403 (botDetected).
export default function botFingerprintPresence(req, res, next) {
  try {
    // Allow the server-side fingerprinting endpoint to run even when
    // there is no `visitorId` present yet. The endpoint will compute
    // and store the hashed visitor id in the session; blocking here
    // would prevent that flow.
    const url = (req && (req.originalUrl || req.url || '')) + '';
    if (url.includes('chat-session-fingerprint')) {
      return next();
    }
    // If session middleware hasn't run or session is missing, fail
    if (!req || !req.session) {
      res.statusCode = 403;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ error: 'botDetected', message: 'Session required' }));
    }

    // We expect `visitorId` to be set (contains hashed visitor id)
    if (!req.session.visitorId) {
      res.statusCode = 403;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ error: 'botDetected', message: 'Fingerprint required' }));
    }

    return next();
  } catch (e) {
    if (console && console.error) console.error('botFingerprintPresence error', e);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: 'server_error' }));
  }
}
