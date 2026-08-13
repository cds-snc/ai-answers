import { SettingsService } from '../../services/SettingsService.js';
import { requireLiteralString } from '../util/db-query.js';
import { authMiddleware, adminMiddleware, withProtection } from '../../middleware/auth.js';

async function bulkSettingsHandler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const { keys } = req.body || {};
  if (!Array.isArray(keys) || keys.length === 0) {
    return res.status(400).json({ message: 'Keys required' });
  }

  try {
    const values = {};
    for (const rawKey of keys) {
      const key = requireLiteralString(rawKey, 'setting key');
      values[key] = SettingsService.get(key);
    }
    return res.status(200).json({ values });
  } catch (error) {
    // requireLiteralString throws on a malformed key — catch here so bad
    // input returns a clean 400 instead of an unhandled rejection, which
    // would otherwise crash the whole server process.
    return res.status(400).json({ message: error.message || 'Invalid request' });
  }
}

export default function handler(req, res) {
  return withProtection(bulkSettingsHandler, authMiddleware, adminMiddleware)(req, res);
}
