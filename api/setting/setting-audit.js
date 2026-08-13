import SettingsAuditService from '../../services/SettingsAuditService.js';
import { authMiddleware, adminMiddleware, withProtection } from '../../middleware/auth.js';
import { requireString } from '../util/db-query.js';

async function settingAuditHandler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const { limit = 50, skip = 0, before = null } = req.query || {};
  let result;
  try {
    result = await SettingsAuditService.list({
      limit: Number.parseInt(limit, 10),
      skip: Number.parseInt(skip, 10),
      before: before ? requireString(before, 'before') : null,
    });
  } catch (error) {
    // requireString/buildListQuery throw on a malformed `before` cursor —
    // catch here so bad input returns a clean 400 instead of an unhandled
    // rejection, which would otherwise crash the whole server process.
    return res.status(400).json({ message: error.message || 'Invalid request' });
  }
  return res.status(200).json(result);
}

export default function handler(req, res) {
  return withProtection(settingAuditHandler, authMiddleware, adminMiddleware)(req, res);
}
