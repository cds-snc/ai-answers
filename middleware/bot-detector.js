let Detector = null;

async function loadDetector() {
  if (Detector !== null) return Detector;
  try {
    const mod = await import('bot-detector');
    Detector = mod?.default || mod;
  } catch (e) {
    if (console?.debug) console.debug('bot-detector package not available');
    Detector = false;
  }
  return Detector;
}

function getClientIP(req) {
  if (!req) return '';
  if (req.ip) return req.ip;
  const forwarded = req.headers?.['x-forwarded-for'];
  if (forwarded) return forwarded.split(',')[0]?.trim() || '';
  return req.connection?.remoteAddress || '';
}

async function detectBot(ua, ip) {
  const detector = await loadDetector();
  if (!detector || typeof detector !== 'function') return false;

  try {
    const result = detector(ua, { ip });
    return !!result;
  } catch (e) {
    if (console?.debug) console.debug('bot-detector check failed', e?.message);
    return false;
  }
}

export default async function botDetector(req, res, next) {
  try {
    // Disable bot detection during automated tests
    if (process.env.NODE_ENV === 'test') return next();
    const ua = req?.headers?.['user-agent'] || '';
    if (!ua) return next();

    const ip = getClientIP(req);
    const isBot = await detectBot(ua, ip);

    if (isBot) {
      res.statusCode = 403;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'botDetected', message: 'Bot detected' }));
      return;
    }

    next();
  } catch (e) {
    if (console?.error) console.error('botDetector error:', e?.message);
    next();
  }
}
