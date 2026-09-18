import { clearDownloadWebPageCache } from '../../agents/tools/downloadWebPage.js';
import SettingsAuditService from '../../services/SettingsAuditService.js';
import { authMiddleware, adminMiddleware, withProtection } from '../../middleware/auth.js';

async function clearDownloadWebPageCacheHandler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const deletedCount = await clearDownloadWebPageCache();
  await SettingsAuditService.recordAuditSafely(
    () => SettingsAuditService.recordAction({
      actorUserId: req.user?.userId,
      actorEmail: req.user?.email || 'Unknown admin',
      source: 'admin',
      action: 'download_web_page.cache_cleared',
    }),
    'Failed to record download web page cache clear audit entry'
  );
  return res.status(200).json({ deletedCount });
}

export default function handler(req, res) {
  return withProtection(clearDownloadWebPageCacheHandler, authMiddleware, adminMiddleware)(req, res);
}
