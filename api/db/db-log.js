import ServerLoggingService from '../../services/ServerLoggingService.js';
import { authMiddleware, partnerOrAdminMiddleware, withProtection } from '../../middleware/auth.js';

async function logHandler(req, res) {
    if (req.method === 'POST') {
        try {
            const { chatId, logLevel, message, metadata } = req.body;

            // Validate logLevel
            const allowedLevels = ['info', 'debug', 'warn', 'error'];
            if (!allowedLevels.includes(logLevel)) {
                return res.status(400).json({ error: 'Invalid logLevel' });
            }

            // Sanitize chatId
            let safeChatId = 'system';
            if (chatId) {
                safeChatId = typeof chatId === 'string' ? chatId : String(chatId);
            }

            ServerLoggingService.log(logLevel, message, safeChatId, metadata);
            return res.status(200).json({ success: true });
        } catch (error) {
            console.error('Error saving log:', error);
            return res.status(500).json({ error: 'Failed to save log' });
        }
    } else if (req.method === 'GET') {
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
    } else {
        res.setHeader('Allow', ['GET', 'POST']);
        return res.status(405).end(`Method ${req.method} Not Allowed`);
    }
}

// Only require auth and admin for GET requests
export default function handler(req, res) {
    if (req.method === 'GET') {
        return withProtection(logHandler, authMiddleware, partnerOrAdminMiddleware)(req, res);
    }
    return logHandler(req, res);
}