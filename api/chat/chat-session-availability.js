import { SettingsService } from '../../services/SettingsService.js';
import SessionManagementService from '../../services/SessionManagementService.js';

async function availabilityHandler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });
  try {
    const siteStatusRaw = await SettingsService.get('siteStatus');
    const siteStatus = siteStatusRaw === 'available';
    let sessionAvailable = false;
    try {
      sessionAvailable = Boolean(await SessionManagementService.sessionsAvailable());
    } catch (e) {
      sessionAvailable = false;
    }

    return res.status(200).json({ siteStatus, sessionAvailable });
  } catch (e) {
    console.error('chat-session-avalability error', e);
    return res.status(200).json({ siteStatus: false, sessionAvailable: false });
  }
}

export default function handler(req, res) {
  return availabilityHandler(req, res);
}
