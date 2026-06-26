import { describe, it, expect, vi, beforeEach } from 'vitest';
import handler from '../experimental-batch-chat-logs-export.js';
import { ExperimentalBatchItem } from '../../../models/experimentalBatchItem.js';
import { chatExportHandler } from '../../chat/chat-export-logs.js';

vi.mock('../../../models/experimentalBatchItem.js', () => ({
    ExperimentalBatchItem: {
        find: vi.fn()
    }
}));

vi.mock('../../db/db-connect.js', () => ({ default: vi.fn() }));

vi.mock('../../chat/chat-export-logs.js', () => ({
    chatExportHandler: vi.fn(async (req, res) => {
        res.json({ ok: true, query: req.query });
    })
}));

vi.mock('../../../middleware/auth.js', () => ({
    authMiddleware: vi.fn((req, res, next) => next()),
    adminMiddleware: vi.fn((req, res, next) => next()),
    withProtection: vi.fn((handlerFn) => handlerFn)
}));

describe('experimental-batch-chat-logs-export API', () => {
    let req;
    let res;

    beforeEach(() => {
        vi.clearAllMocks();
        req = {
            method: 'GET',
            params: { id: '507f1f77bcf86cd799439011' },
            query: { baselineRunId: '507f1f77bcf86cd799439012' }
        };
        res = {
            json: vi.fn(),
            status: vi.fn().mockReturnThis()
        };
    });

    it('collects baseline chatIds before current chatIds and dedupes overlaps', async () => {
        ExperimentalBatchItem.find
            .mockReturnValueOnce({
                sort: vi.fn().mockReturnThis(),
                select: vi.fn().mockReturnThis(),
                lean: vi.fn().mockResolvedValue([
                    { chatId: 'baseline-1' },
                    { chatId: 'shared-chat' }
                ])
            })
            .mockReturnValueOnce({
                sort: vi.fn().mockReturnThis(),
                select: vi.fn().mockReturnThis(),
                lean: vi.fn().mockResolvedValue([
                    { chatId: 'shared-chat' },
                    { chatId: 'current-1' }
                ])
            });

        await handler(req, res);

        expect(ExperimentalBatchItem.find).toHaveBeenNthCalledWith(1, { experimentalBatch: '507f1f77bcf86cd799439012' });
        expect(ExperimentalBatchItem.find).toHaveBeenNthCalledWith(2, { experimentalBatch: '507f1f77bcf86cd799439011' });
        expect(chatExportHandler).toHaveBeenCalledWith(
            expect.any(Object),
            res
        );
        expect(chatExportHandler.mock.calls[0][0].query).toEqual(expect.objectContaining({
            view: 'default',
            format: 'xlsx',
            chatIds: 'baseline-1,shared-chat,current-1'
        }));
    });

    it('returns a clear error when no persisted chat ids are available', async () => {
        ExperimentalBatchItem.find
            .mockReturnValueOnce({
                sort: vi.fn().mockReturnThis(),
                select: vi.fn().mockReturnThis(),
                lean: vi.fn().mockResolvedValue([{ chatId: '', baselineChatId: '' }])
            })
            .mockReturnValueOnce({
                sort: vi.fn().mockReturnThis(),
                select: vi.fn().mockReturnThis(),
                lean: vi.fn().mockResolvedValue([{ chatId: '', baselineChatId: '' }])
            });

        await handler(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith({ error: 'No persisted chat IDs found for export' });
    });
});
