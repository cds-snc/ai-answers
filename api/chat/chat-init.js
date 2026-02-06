import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { SettingsService } from '../../services/SettingsService.js';
import ChatSessionService from '../../services/ChatSessionService.js';
import { withOptionalUser } from '../../middleware/auth.js';
import { withSession } from '../../middleware/chat-session.js';

const fingerprintPepper = process.env.FP_PEPPER || 'dev-pepper';

async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

    const { visitorId } = req.body || {};
    const session = req.session;

    // 1. Store fingerprint in session (if provided)
    if (visitorId && session) {
        const fingerprintKey = crypto.createHmac('sha256', fingerprintPepper)
            .update(String(visitorId)).digest('hex');
        session.visitorId = fingerprintKey;
    }

    // 2. Check availability
    const siteStatusRaw = SettingsService.get('siteStatus') || 'available';
    const siteAvailable = siteStatusRaw === 'available';
    const sessionAvailable = await ChatSessionService.sessionsAvailable(req.sessionID);
    const available = siteAvailable && sessionAvailable;

    // 3. Create chatId
    const chatId = uuidv4();
    if (session) {
        session.chatIds = (session.chatIds || []).concat(chatId);

        // 4. Save session
        try {
            await new Promise((resolve, reject) => {
                session.save(err => err ? reject(err) : resolve());
            });
        } catch (e) {
            console.error('[chat-init] Failed to save session', e);
        }
    }

    return res.status(200).json({
        chatId,
        available,
        sessionManagementEnabled: ChatSessionService.isManagementEnabled()
    });
}

export default withOptionalUser(withSession(handler));
