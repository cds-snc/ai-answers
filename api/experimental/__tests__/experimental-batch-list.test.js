import { describe, it, expect, vi, beforeEach } from 'vitest';
import handler from '../experimental-batch-list.js';
import { ExperimentalBatch } from '../../../models/experimentalBatch.js';

vi.mock('../../../models/experimentalBatch.js', () => ({
    ExperimentalBatch: {
        find: vi.fn(),
        countDocuments: vi.fn()
    }
}));

vi.mock('../../../middleware/auth.js', () => ({
    authMiddleware: vi.fn((req, res, next) => next()),
    adminMiddleware: vi.fn((req, res, next) => next()),
    withProtection: vi.fn((handlerFn) => handlerFn)
}));

describe('experimental-batch-list API', () => {
    let req;
    let res;

    beforeEach(() => {
        req = { query: {} };
        res = {
            json: vi.fn(),
            status: vi.fn().mockReturnThis()
        };
        vi.clearAllMocks();
    });

    it('should populate createdBy email when listing batches', async () => {
        const batches = [{
            _id: 'batch-1',
            name: 'Run 1',
            createdBy: { email: 'starter@example.com' }
        }];

        const findQuery = {
            populate: vi.fn().mockReturnThis(),
            sort: vi.fn().mockReturnThis(),
            skip: vi.fn().mockReturnThis(),
            limit: vi.fn().mockResolvedValue(batches)
        };

        ExperimentalBatch.find.mockReturnValue(findQuery);
        ExperimentalBatch.countDocuments.mockResolvedValue(1);

        await handler(req, res);

        expect(ExperimentalBatch.find).toHaveBeenCalledWith({});
        expect(findQuery.populate).toHaveBeenCalledWith('createdBy', 'email');
        expect(res.json).toHaveBeenCalledWith({
            data: batches,
            recordsTotal: 1,
            recordsFiltered: 1,
            pagination: {
                page: 1,
                limit: 20,
                total: 1,
                pages: 1
            }
        });
    });

    it('should return 500 when listing batches fails', async () => {
        const findQuery = {
            populate: vi.fn().mockReturnThis(),
            sort: vi.fn().mockReturnThis(),
            skip: vi.fn().mockReturnThis(),
            limit: vi.fn().mockRejectedValue(new Error('DB failure'))
        };

        ExperimentalBatch.find.mockReturnValue(findQuery);
        ExperimentalBatch.countDocuments.mockResolvedValue(0);
        const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

        await handler(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({ error: 'Failed to list batches' });
        spy.mockRestore();
    });

    it('should normalize filter values before using them in database queries', async () => {
        const datasetId = '507f1f77bcf86cd799439011';
        const findQuery = {
            populate: vi.fn().mockReturnThis(),
            sort: vi.fn().mockReturnThis(),
            skip: vi.fn().mockReturnThis(),
            limit: vi.fn().mockResolvedValue([])
        };
        req.query = { type: 'analysis', datasetId };
        ExperimentalBatch.find.mockReturnValue(findQuery);
        ExperimentalBatch.countDocuments.mockResolvedValue(0);

        await handler(req, res);

        const expectedQuery = { type: 'analysis', 'config.datasetId': datasetId };
        expect(ExperimentalBatch.countDocuments).toHaveBeenNthCalledWith(1, expectedQuery);
        expect(ExperimentalBatch.countDocuments).toHaveBeenNthCalledWith(2, expectedQuery);
        expect(ExperimentalBatch.find).toHaveBeenCalledWith(expectedQuery);
    });

    it('should return 500 for invalid filter values', async () => {
        req.query = { type: { $ne: 'analysis' } };
        const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

        await handler(req, res);

        expect(ExperimentalBatch.countDocuments).not.toHaveBeenCalled();
        expect(ExperimentalBatch.find).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({ error: 'Failed to list batches' });
        spy.mockRestore();
    });
});
