import { SettingsService } from '../../services/SettingsService.js';
import SettingsAuditService from '../../services/SettingsAuditService.js';
import { authMiddleware, adminMiddleware, withProtection } from '../../middleware/auth.js';

async function settingsRefreshCacheHandler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  await SettingsService.refreshCache();
  await SettingsAuditService.recordAction({
    actorUserId: req.user?.userId,
    actorEmail: req.user?.email || 'Unknown admin',
    source: 'admin',
    action: 'settings.cache_refreshed',
  });
  return res.status(200).json({ message: 'Settings cache refreshed' });
}

export default function handler(req, res) {
  return withProtection(settingsRefreshCacheHandler, authMiddleware, adminMiddleware)(req, res);
}
