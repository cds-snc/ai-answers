import ServerLoggingService from '../../services/ServerLoggingService.js';
import { authMiddleware, partnerOrAdminMiddleware, withProtection } from '../../middleware/auth.js';

const DEFAULT_LOG_LIMIT = 1000;
const MAX_LOG_LIMIT = 1000;
const MAX_LOG_SKIP = 100000;

function readNonNegativeInt(value, { fallback, max, min = 0 }) {
    if (value === undefined) {
        return fallback;
    }
    if (typeof value !== 'string' || !/^\d+$/.test(value)) {
        return null;
    }
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
        return null;
    }
    return parsed;
}

async function logHandler(req, res) {
    try {
        const { chatId, level, skip, limit } = req.query;

        // One chat per request. A missing id used to match every chat in the
        // legacy collection. Arrays are rejected here too, so a repeated
        // chatId cannot arrive as a query operator.
        if (typeof chatId !== 'string' || chatId.trim() === '') {
            return res.status(400).json({ error: 'Invalid chatId' });
        }
        const safeChatId = chatId.trim();

        let safeLevel = null;
        if (level !== undefined) {
            const allowedLevels = ['info', 'debug', 'warn', 'error', 'all'];
            const normalizedLevel = String(level).toLowerCase();
            if (!allowedLevels.includes(normalizedLevel)) {
                return res.status(400).json({ error: 'Invalid level' });
            }
            safeLevel = normalizedLevel;
        }

        const safeSkip = readNonNegativeInt(skip, { fallback: 0, max: MAX_LOG_SKIP });
        if (safeSkip === null) {
            return res.status(400).json({ error: 'Invalid skip' });
        }
        const safeLimit = readNonNegativeInt(limit, { fallback: DEFAULT_LOG_LIMIT, max: MAX_LOG_LIMIT, min: 1 });
        if (safeLimit === null) {
            return res.status(400).json({ error: 'Invalid limit' });
        }

        const logs = await ServerLoggingService.getLogs({
            chatId: safeChatId,
            level: safeLevel,
            skip: safeSkip,
            limit: safeLimit
        });
        return res.status(200).json(logs);
    } catch (error) {
        console.error('Error fetching logs:', error);
        return res.status(500).json({ error: 'Failed to fetch logs' });
    }
}

// Logs for one chat, loaded by ChatViewer (DataStoreService.getLogs).
// Partner or admin only.
export default function handler(req, res) {
    if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET');
        return res.status(405).end(`Method ${req.method} Not Allowed`);
    }
    return withProtection(logHandler, authMiddleware, partnerOrAdminMiddleware)(req, res);
}
