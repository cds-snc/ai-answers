import { SettingsService } from '../../services/SettingsService.js';
import ChatSessionService from '../../services/ChatSessionService.js';

function isAuthenticated(req) {
  return Boolean(
    req.user ||
    req.session?.passport?.user ||
    req.session?.user ||
    req.session?.userId ||
    req.session?.authenticated ||
    req.session?.isAuthenticated
  );
}

async function availabilityHandler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });
  try {
    const siteStatusRaw = SettingsService.get('siteStatus');
    const siteStatus = siteStatusRaw === 'available';
    let sessionAvailable = isAuthenticated(req);
    if (!sessionAvailable) {
      try {
        sessionAvailable = Boolean(await ChatSessionService.sessionsAvailable(req.sessionID));
      } catch (e) {
        sessionAvailable = false;
      }
    }

    return res.status(200).json({ siteStatus, sessionAvailable });
  } catch (e) {
    console.error('chat-session-availability error', e);
    return res.status(200).json({ siteStatus: false, sessionAvailable: false });
  }
}

export default function handler(req, res) {
  return availabilityHandler(req, res);
}
