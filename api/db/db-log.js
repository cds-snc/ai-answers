import ServerLoggingService from '../../services/ServerLoggingService.js';
import { authMiddleware, partnerOrAdminMiddleware, withProtection } from '../../middleware/auth.js';

async function logHandler(req, res) {
    try {
        const { chatId, level, skip = 0, limit = 1000 } = req.query;

        // Sanitize and validate query parameters to avoid NoSQL injection
        let safeChatId = null;
        if (chatId !== undefined) {
            // Reject objects/arrays to prevent operator injection
            if (typeof chatId === 'object' && chatId !== null) {
                return res.status(400).json({ error: 'Invalid chatId' });
            }
            safeChatId = typeof chatId === 'string' ? chatId : String(chatId);
        }

        let safeLevel = null;
        if (level !== undefined) {
            const allowedLevels = ['info', 'debug', 'warn', 'error', 'all'];
            const normalizedLevel = String(level).toLowerCase();
            if (!allowedLevels.includes(normalizedLevel)) {
                return res.status(400).json({ error: 'Invalid level' });
            }
            safeLevel = normalizedLevel;
        }

        const logs = await ServerLoggingService.getLogs({
            chatId: safeChatId,
            level: safeLevel,
            skip: parseInt(skip),
            limit: parseInt(limit)
        });
        return res.status(200).json(logs);
    } catch (error) {
        console.error('Error fetching logs:', error);
        return res.status(500).json({ error: 'Failed to fetch logs' });
    }
}

// ChatViewer reads logs with GET. The old POST never stored anything the
// browser sent (that client used different field names), and feedback is
// saved on its own endpoints, so this route does not accept writes.
export default function handler(req, res) {
    if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET');
        return res.status(405).end(`Method ${req.method} Not Allowed`);
    }
    return withProtection(logHandler, authMiddleware, partnerOrAdminMiddleware)(req, res);
}
