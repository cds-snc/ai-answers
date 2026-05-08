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
});
