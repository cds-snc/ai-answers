import dbConnect from '../db/db-connect.js';
import { ExperimentalBatchItem } from '../../models/experimentalBatchItem.js';
import { authMiddleware, adminMiddleware, withProtection } from '../../middleware/auth.js';
import { requireObjectIdString } from '../util/db-query.js';
import { chatExportHandler } from '../chat/chat-export-logs.js';

async function handler(req, res) {
    try {
        await dbConnect();

        let { id } = req.params;
        let { baselineRunId } = req.query || {};

        id = requireObjectIdString(id, 'batchId');
        const batchIds = [baselineRunId, id]
            .filter(Boolean)
            .map((batchId) => requireObjectIdString(batchId, 'batchId'));

        const orderedChatIds = [];
        const seen = new Set();

        for (const batchId of batchIds) {
            const items = await ExperimentalBatchItem.find({ experimentalBatch: batchId })
                .sort({ rowIndex: 1, trialIndex: 1 })
                .select('chatId')
                .lean();

            for (const item of items) {
                const normalized = String(item.chatId || '').trim();
                if (!normalized || seen.has(normalized)) continue;
                seen.add(normalized);
                orderedChatIds.push(normalized);
            }
        }

        if (!orderedChatIds.length) {
            return res.status(404).json({ error: 'No persisted chat IDs found for export' });
        }

        req.query = {
            ...req.query,
            view: 'default',
            format: 'xlsx',
            chatIds: orderedChatIds.join(',')
        };

        return chatExportHandler(req, res);
    } catch (error) {
        console.error('Experimental batch chat logs export error:', error);
        return res.status(500).json({ error: 'Failed to export chat logs' });
    }
}

export default function (req, res) {
    return withProtection(handler, authMiddleware, adminMiddleware)(req, res);
}
