import { SettingsService } from '../../services/SettingsService.js';
import { requireLiteralString } from '../util/db-query.js';

const PUBLIC_SETTING_KEYS = new Set(['siteStatus', 'model.default', 'workflow.default']);

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ message: 'Method Not Allowed' });
  }
  let { key } = req.query;
  if (!key) {
    return res.status(400).json({ message: 'Key required' });
  }
  key = requireLiteralString(key, 'setting key');
  if (!PUBLIC_SETTING_KEYS.has(key)) {
    return res.status(404).json({ message: 'Setting not found' });
  }
  const value = SettingsService.get(key);
  return res.status(200).json({ key, value });
}
