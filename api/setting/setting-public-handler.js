import { SettingsService } from '../../services/SettingsService.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ message: 'Method Not Allowed' });
  }
  const { key } = req.query;
  if (!key) {
    return res.status(400).json({ message: 'Key required' });
  }
  const value = await SettingsService.get(key);
  return res.status(200).json({ key, value });
}
