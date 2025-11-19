import { SettingsService } from '../../services/SettingsService.js';
import { authMiddleware, adminMiddleware, withProtection } from '../../middleware/auth.js';

async function settingsHandler(req, res) {
  if (req.method === 'GET') {
    const { key } = req.query;
    if (!key) {
      return res.status(400).json({ message: 'Key required' });
    }
    const value = await SettingsService.get(key);
    return res.status(200).json({ key, value });
  } else if (req.method === 'POST') {
    const { key, value } = req.body;
    if (!key) {
      return res.status(400).json({ message: 'Key required' });
    }
    await SettingsService.set(key, value);
    return res.status(200).json({ message: 'Setting updated' });
  } else {
    res.setHeader('Allow', ['GET', 'POST']);
    return res.status(405).json({ message: 'Method Not Allowed' });
  }
}

export default function handler(req, res) {
  return withProtection(settingsHandler, authMiddleware, adminMiddleware)(req, res);
}
