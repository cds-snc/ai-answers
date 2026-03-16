import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExperimentalBatchItem } from '../../../models/experimentalBatchItem.js';
import handler from '../experimental-batch-export.js';

// Hoist the mock objects so they are available to vi.mock
const { mockWorkbookInstance, mockWorksheet } = vi.hoisted(() => {
    const columnMock = {
        eachCell: vi.fn()
    };
    const worksheet = {
        columns: [],
        addRows: vi.fn(),
        getColumn: vi.fn(() => columnMock),
        eachRow: vi.fn()
    };
    const workbookInstance = {
        addWorksheet: vi.fn(() => worksheet),
        xlsx: {
            write: vi.fn(() => Promise.resolve())
        }
    };
    return { mockWorkbookInstance: workbookInstance, mockWorksheet: worksheet, mockColumn: columnMock };
});

// Mock models
vi.mock('../../../models/experimentalBatchItem.js', () => ({
    ExperimentalBatchItem: {
        find: vi.fn()
    }
}));

// Mock middleware
vi.mock('../../../middleware/auth.js', () => ({
    authMiddleware: vi.fn((req, res, next) => next()),
    adminMiddleware: vi.fn((req, res, next) => next()),
    withProtection: vi.fn((handlerFn) => handlerFn)
}));

// Mock the exceljs and flat modules
vi.mock('exceljs', () => {
    const Workbook = vi.fn(() => mockWorkbookInstance);
    return {
        default: { Workbook },
        Workbook
    };
});

vi.mock('flat', () => {
    const flatten = vi.fn(x => x);
    return {
        default: { flatten },
        flatten
    };
});

describe('experimental-batch-export API', () => {
    let req;
    let res;

    beforeEach(() => {
        req = {
            params: { id: 'batch-123' },
            query: {}
        };
        res = {
            json: vi.fn(),
            setHeader: vi.fn(),
            end: vi.fn(),
            status: vi.fn().mockReturnThis(),
            write: vi.fn(),
            on: vi.fn(),
            once: vi.fn(),
            emit: vi.fn()
        };
        vi.clearAllMocks();

        // Setup default mock responses
        const mockItems = [{ rowIndex: 1, question: 'A' }];
        const findMock = {
            sort: vi.fn().mockReturnThis(),
            lean: vi.fn().mockResolvedValue(mockItems)
        };
        ExperimentalBatchItem.find.mockReturnValue(findMock);
    });

    it('should export items as JSON by default', async () => {
        await handler(req, res);
        expect(ExperimentalBatchItem.find).toHaveBeenCalledWith({ experimentalBatch: 'batch-123' });
        expect(res.json).toHaveBeenCalledWith([{ rowIndex: 1, question: 'A' }]);
    });

    it('should export items as Excel when format=excel', async () => {
        req.query.format = 'excel';

        await handler(req, res);

        // Verify successful exit
        expect(res.status).not.toHaveBeenCalledWith(500);

        // Verify headers for Excel download
        expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

        // Verify workbook and worksheet usage
        expect(mockWorkbookInstance.addWorksheet).toHaveBeenCalledWith('Batch Results');
        expect(mockWorkbookInstance.xlsx.write).toHaveBeenCalledWith(res);
        expect(res.end).toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
        const findMock = {
            sort: vi.fn().mockReturnThis(),
            lean: vi.fn().mockRejectedValue(new Error('DB failure'))
        };
        ExperimentalBatchItem.find.mockReturnValue(findMock);

        const spy = vi.spyOn(console, 'error').mockImplementation(() => { });

        await handler(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({ error: 'Failed to export batch' });
        spy.mockRestore();
    });
});
