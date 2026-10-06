import { clearSearchResultCache } from '../../services/SearchResultCacheService.js';
import SettingsAuditService from '../../services/SettingsAuditService.js';
import { authMiddleware, adminMiddleware, withProtection } from '../../middleware/auth.js';

async function clearSearchCacheHandler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  try {
    await clearSearchResultCache();
  } catch (error) {
    console.error('Failed to clear search cache:', error);
    return res.status(500).json({ success: false });
  }
  await SettingsAuditService.recordAuditSafely(
    () => SettingsAuditService.recordAction({
      actorUserId: req.user?.userId,
      actorEmail: req.user?.email || 'Unknown admin',
      source: 'admin',
      action: 'search_context.cache_cleared',
    }),
    'Failed to record search cache clear audit entry'
  );
  return res.status(200).json({ success: true });
}

export default function handler(req, res) {
  return withProtection(clearSearchCacheHandler, authMiddleware, adminMiddleware)(req, res);
}
