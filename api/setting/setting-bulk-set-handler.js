import { SettingsService } from '../../services/SettingsService.js';
import { authMiddleware, adminMiddleware, withProtection } from '../../middleware/auth.js';

async function bulkSetSettingsHandler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const { changes } = req.body || {};
  if (!Array.isArray(changes) || changes.length === 0) {
    return res.status(400).json({ message: 'Changes required' });
  }
  if (!changes.every((change) => change && typeof change === 'object' && 'key' in change && 'value' in change)) {
    return res.status(400).json({ message: 'Each change requires a key and value' });
  }

  let result;
  try {
    result = await SettingsService.setMany(changes, {
      actorUserId: req.user?.userId,
      actorEmail: req.user?.email || 'Unknown admin',
      source: 'admin',
    });
  } catch (error) {
    // setMany validates every key/value up front and throws synchronously
    // before any DB write if the shape is bad — surface that as a clean 400
    // instead of letting it become an unhandled rejection.
    return res.status(400).json({ message: error.message || 'Invalid changes' });
  }

  return res.status(200).json(result);
}

export default function handler(req, res) {
  return withProtection(bulkSetSettingsHandler, authMiddleware, adminMiddleware)(req, res);
}
