import SettingsAuditService from '../../services/SettingsAuditService.js';
import { authMiddleware, adminMiddleware, withProtection } from '../../middleware/auth.js';

async function settingAuditHandler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const { limit = 50, skip = 0 } = req.query || {};
  const result = await SettingsAuditService.list({
    limit: Number.parseInt(limit, 10),
    skip: Number.parseInt(skip, 10),
  });
  return res.status(200).json(result);
}

export default function handler(req, res) {
  return withProtection(settingAuditHandler, authMiddleware, adminMiddleware)(req, res);
}
