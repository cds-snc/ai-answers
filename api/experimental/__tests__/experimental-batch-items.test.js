import { describe, it, expect, vi, beforeEach } from 'vitest';
import handler from '../experimental-batch-items.js';
import { ExperimentalBatch } from '../../../models/experimentalBatch.js';
import { ExperimentalBatchItem } from '../../../models/experimentalBatchItem.js';

vi.mock('../../../models/experimentalBatch.js', () => ({
    ExperimentalBatch: {
        findById: vi.fn()
    }
}));

vi.mock('../../../models/experimentalBatchItem.js', () => ({
    ExperimentalBatchItem: {
        find: vi.fn(),
        countDocuments: vi.fn()
    }
}));

vi.mock('../../../middleware/auth.js', () => ({
    authMiddleware: vi.fn((req, res, next) => next()),
    adminMiddleware: vi.fn((req, res, next) => next()),
    withProtection: vi.fn((handlerFn) => handlerFn)
}));

const VALID_ID = '507f1f77bcf86cd799439011';

const mockBatchQuery = (batch) => {
    ExperimentalBatch.findById.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue(batch)
    });
};

const mockItemsQuery = (items) => {
    const findQuery = {
        select: vi.fn().mockReturnThis(),
        sort: vi.fn().mockReturnThis(),
        skip: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue(items)
    };
    ExperimentalBatchItem.find.mockReturnValue(findQuery);
    return findQuery;
};

describe('experimental-batch-items API', () => {
    let req;
    let res;

    beforeEach(() => {
        req = { params: { id: VALID_ID }, query: {} };
        res = {
            json: vi.fn(),
            status: vi.fn().mockReturnThis()
        };
        vi.clearAllMocks();
    });

    it('returns batch, items, counts and pagination', async () => {
        const batch = { _id: VALID_ID, name: 'Run 1' };
        const items = [{ _id: 'item-1', rowIndex: 0, flagged: true }];

        mockBatchQuery(batch);
        const findQuery = mockItemsQuery(items);
        ExperimentalBatchItem.countDocuments.mockResolvedValue(1);

        await handler(req, res);

        expect(ExperimentalBatchItem.find).toHaveBeenCalledWith({ experimentalBatch: VALID_ID });
        expect(findQuery.select).toHaveBeenCalledWith('-originalData');
        expect(findQuery.sort).toHaveBeenCalledWith({ rowIndex: 1, trialIndex: 1 });
        expect(res.json).toHaveBeenCalledWith({
            batch,
            items,
            filter: 'all',
            row: null,
            counts: { total: 1, attention: 1, errors: 1 },
            pagination: { page: 1, limit: 25, total: 1, pages: 1 }
        });
    });

    it('filters to all trials of one question when row is set', async () => {
        req.query.row = '3';
        req.query.filter = 'attention';
        mockBatchQuery({ _id: VALID_ID });
        mockItemsQuery([]);
        ExperimentalBatchItem.countDocuments.mockResolvedValue(0);

        await handler(req, res);

        // row overrides the verdict filter so every trial is visible
        expect(ExperimentalBatchItem.find).toHaveBeenCalledWith({
            experimentalBatch: VALID_ID,
            rowIndex: 3
        });
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ row: 3 }));
    });

    it('applies the attention filter to the item query', async () => {
        req.query.filter = 'attention';
        mockBatchQuery({ _id: VALID_ID });
        mockItemsQuery([]);
        ExperimentalBatchItem.countDocuments.mockResolvedValue(0);

        await handler(req, res);

        expect(ExperimentalBatchItem.find).toHaveBeenCalledWith({
            experimentalBatch: VALID_ID,
            $or: [{ flagged: true }, { match: false }, { status: 'failed' }]
        });
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ filter: 'attention' }));
    });

    it('falls back to the all filter for unknown filter values', async () => {
        req.query.filter = 'bogus';
        mockBatchQuery({ _id: VALID_ID });
        mockItemsQuery([]);
        ExperimentalBatchItem.countDocuments.mockResolvedValue(0);

        await handler(req, res);

        expect(ExperimentalBatchItem.find).toHaveBeenCalledWith({ experimentalBatch: VALID_ID });
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ filter: 'all' }));
    });

    it('returns 404 when the batch does not exist', async () => {
        mockBatchQuery(null);

        await handler(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith({ error: 'Batch not found' });
    });

    it('returns 500 for an invalid batch id', async () => {
        req.params.id = 'not-an-object-id';
        const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

        await handler(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({ error: 'Failed to get batch items' });
        spy.mockRestore();
    });
});
