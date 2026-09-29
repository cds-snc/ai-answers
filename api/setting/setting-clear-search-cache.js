import { clearSearchResultCache } from '../../services/SearchResultCacheService.js';
import SettingsAuditService from '../../services/SettingsAuditService.js';
import { authMiddleware, adminMiddleware, withProtection } from '../../middleware/auth.js';

async function clearSearchCacheHandler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const deletedCount = await clearSearchResultCache();
  await SettingsAuditService.recordAuditSafely(
    () => SettingsAuditService.recordAction({
      actorUserId: req.user?.userId,
      actorEmail: req.user?.email || 'Unknown admin',
      source: 'admin',
      action: 'search_context.cache_cleared',
    }),
    'Failed to record search cache clear audit entry'
  );
  return res.status(200).json({ deletedCount });
}

export default function handler(req, res) {
  return withProtection(clearSearchCacheHandler, authMiddleware, adminMiddleware)(req, res);
}
