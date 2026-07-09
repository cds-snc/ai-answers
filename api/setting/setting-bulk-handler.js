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

  const values = {};
  for (const rawKey of keys) {
    const key = requireLiteralString(rawKey, 'setting key');
    values[key] = SettingsService.get(key);
  }

  return res.status(200).json({ values });
}

export default function handler(req, res) {
  return withProtection(bulkSettingsHandler, authMiddleware, adminMiddleware)(req, res);
}
