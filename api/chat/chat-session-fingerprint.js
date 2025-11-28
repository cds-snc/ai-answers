import crypto from 'crypto';
import { withSession } from '../../middleware/chat-session.js';

const fingerprintPepper = process.env.FP_PEPPER || 'dev-pepper';

export async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const { visitorId } = req.body || {};
    if (!visitorId) return res.status(400).json({ error: 'missing_visitorId' });

    // `withSession` ensures `req.session` is available and persisted by express-session
    const session = req.session;
    if (!session) return res.status(400).json({ error: 'no_session' });

    // Hash the visitorId again server-side using the server pepper
    try {
      const fingerprintKey = crypto.createHmac('sha256', fingerprintPepper).update(String(visitorId)).digest('hex');
      // Store only the hashed visitor id in the session (do not store raw visitorId)
      // Keep the field name as `visitorId` per request, but it contains the hashed value.
      session.visitorId = fingerprintKey;
      // Ensure session is saved (express-session will persist it based on store)
      if (typeof session.save === 'function') {
        session.save(() => { });
      }
    } catch (e) {
      if (console && console.error) console.error('Failed to compute/store fingerprintKey', e);
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    if (console && console.error) console.error('chat-session-fingerprint error', e);
    return res.status(500).json({ error: 'server_error' });
  }
}

export default withSession(handler);
