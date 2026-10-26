import SettingsAuditService from '../../services/SettingsAuditService.js';
import { authMiddleware, adminMiddleware, withProtection } from '../../middleware/auth.js';

async function settingAuditHandler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const { limit = 50, skip = 0, search = '' } = req.query || {};
  let result;
  try {
    result = await SettingsAuditService.list({
      limit: Number.parseInt(limit, 10),
      skip: Number.parseInt(skip, 10),
      search: typeof search === 'string' ? search : '',
    });
  } catch (error) {
    // Caught defensively so a DB error here returns a clean 400/500 instead
    // of an unhandled rejection, which would otherwise crash the whole
    // server process — see api/setting/setting-handler.js and siblings for
    // the same pattern.
    return res.status(400).json({ message: error.message || 'Invalid request' });
  }
  return res.status(200).json(result);
}

export default function handler(req, res) {
  return withProtection(settingAuditHandler, authMiddleware, adminMiddleware)(req, res);
}
