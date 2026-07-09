import { describe, it, expect, vi, beforeEach } from 'vitest';
import handler from '../experimental-dataset-export.js';

const { mockExportDataset } = vi.hoisted(() => ({
    mockExportDataset: vi.fn()
}));

vi.mock('../../../services/experimental/ExperimentalDatasetService.js', () => ({
    default: {
        exportDataset: mockExportDataset
    }
}));

vi.mock('../../../middleware/auth.js', () => ({
    authMiddleware: vi.fn((req, res, next) => next()),
    adminMiddleware: vi.fn((req, res, next) => next()),
    withProtection: vi.fn((handlerFn) => handlerFn)
}));

describe('experimental-dataset-export API', () => {
    let req;
    let res;

    beforeEach(() => {
        req = {
            query: { id: 'dataset-123' }
        };
        res = {
            setHeader: vi.fn(),
            send: vi.fn(),
            status: vi.fn().mockReturnThis(),
            json: vi.fn()
        };
        mockExportDataset.mockReset();
    });

    it('should return a csv download for the dataset', async () => {
        mockExportDataset.mockResolvedValue({
            dataset: { name: 'Exportable Dataset' },
            csvText: '\uFEFFchatId,question,answer\r\nchat-1,Question,Answer'
        });

        await handler(req, res);

        expect(mockExportDataset).toHaveBeenCalledWith('dataset-123');
        expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/csv; charset=utf-8');
        expect(res.setHeader).toHaveBeenCalledWith('Content-Disposition', 'attachment; filename="dataset-Exportable-Dataset.csv"');
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.send).toHaveBeenCalledWith('\uFEFFchatId,question,answer\r\nchat-1,Question,Answer');
    });

    it('should return 400 when datasetId is missing', async () => {
        req.query = {};

        await handler(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({ error: 'datasetId is required' });
    });
});
