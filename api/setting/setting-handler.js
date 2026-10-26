import { SettingsService } from '../../services/SettingsService.js';
import { requireLiteralString } from '../util/db-query.js';
import { authMiddleware, adminMiddleware, withProtection } from '../../middleware/auth.js';

async function settingsHandler(req, res) {
  try {
    if (req.method === 'GET') {
      let { key } = req.query;
      if (!key) {
        return res.status(400).json({ message: 'Key required' });
      }
      key = requireLiteralString(key, 'setting key');
      const value = SettingsService.get(key);
      return res.status(200).json({ key, value });
    } else if (req.method === 'POST') {
      let { key, value } = req.body;
      if (!key) {
        return res.status(400).json({ message: 'Key required' });
      }
      key = requireLiteralString(key, 'setting key');
      await SettingsService.set(key, value, {
        actorUserId: req.user?.userId,
        actorEmail: req.user?.email || 'Unknown admin',
        source: 'admin',
      });
      return res.status(200).json({ message: 'Setting updated' });
    } else {
      res.setHeader('Allow', ['GET', 'POST']);
      return res.status(405).json({ message: 'Method Not Allowed' });
    }
  } catch (error) {
    // requireLiteralString/requireString throw on malformed key/value —
    // catch here so bad input returns a clean 400 instead of an unhandled
    // rejection, which would otherwise crash the whole server process.
    return res.status(400).json({ message: error.message || 'Invalid request' });
  }
}

export default function handler(req, res) {
  return withProtection(settingsHandler, authMiddleware, adminMiddleware)(req, res);
}
