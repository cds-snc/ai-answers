// Ensures a hashed visitorId is present in the express session.
// If absent, responds with 403 (botDetected).
export default function botFingerprintPresence(req, res, next) {
  try {
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
