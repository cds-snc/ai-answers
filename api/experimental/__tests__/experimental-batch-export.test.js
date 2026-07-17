import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExperimentalBatchItem } from '../../../models/experimentalBatchItem.js';
import { ExperimentalBatch } from '../../../models/experimentalBatch.js';
import handler from '../experimental-batch-export.js';

// Hoist the mock objects so they are available to vi.mock
const { mockWorkbookInstance, mockWorksheet, mockAnalyzerRegistry } = vi.hoisted(() => {
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
    const analyzerRegistry = {
        get: vi.fn().mockResolvedValue(null)
    };
    return {
        mockWorkbookInstance: workbookInstance,
        mockWorksheet: worksheet,
        mockAnalyzerRegistry: analyzerRegistry,
        mockColumn: columnMock
    };
});

// Mock models
vi.mock('../../../models/experimentalBatchItem.js', () => ({
    ExperimentalBatchItem: {
        find: vi.fn()
    }
}));

vi.mock('../../../models/experimentalBatch.js', () => ({
    ExperimentalBatch: {
        findById: vi.fn()
    }
}));

// Mock middleware
vi.mock('../../../middleware/auth.js', () => ({
    authMiddleware: vi.fn((req, res, next) => next()),
    adminMiddleware: vi.fn((req, res, next) => next()),
    withProtection: vi.fn((handlerFn) => handlerFn)
}));

vi.mock('../../../services/experimental/ExperimentalAnalyzerRegistry.js', () => ({
    default: mockAnalyzerRegistry
}));

// Mock the exceljs and flat modules
vi.mock('exceljs', () => {
    const Workbook = vi.fn(function Workbook() {
        return mockWorkbookInstance;
    });
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
        mockWorksheet.columns = [];
        mockAnalyzerRegistry.get.mockReset();
        mockAnalyzerRegistry.get.mockResolvedValue(null);

        // Setup default mock responses
        const mockItems = [{ rowIndex: 1, question: 'A' }];
        const batchFindMock = {
            select: vi.fn().mockReturnThis(),
            lean: vi.fn().mockResolvedValue({ appVersion: 'v1.153.0', config: {} })
        };
        const findMock = {
            sort: vi.fn().mockReturnThis(),
            lean: vi.fn().mockResolvedValue(mockItems)
        };
        ExperimentalBatch.findById.mockReturnValue(batchFindMock);
        ExperimentalBatchItem.find.mockReturnValue(findMock);
    });

    it('should export items as JSON by default', async () => {
        await handler(req, res);
        expect(ExperimentalBatch.findById).toHaveBeenCalledWith('batch-123');
        expect(ExperimentalBatchItem.find).toHaveBeenCalledWith({ experimentalBatch: 'batch-123' });
        expect(res.json).toHaveBeenCalledWith([{ rowIndex: 1, question: 'A', appVersion: 'v1.153.0' }]);
    });

    it('should export items as Excel when format=excel', async () => {
        req.query.format = 'excel';
        const mockItems = [{
            rowIndex: 1,
            question: 'A',
            answer: 'B',
            createdAt: new Date('2026-05-06T12:00:00.000Z'),
            updatedAt: new Date('2026-05-06T13:00:00.000Z'),
            lastAttemptAt: new Date('2026-05-06T14:00:00.000Z')
        }];
        const findMock = {
            sort: vi.fn().mockReturnThis(),
            lean: vi.fn().mockResolvedValue(mockItems)
        };
        ExperimentalBatchItem.find.mockReturnValue(findMock);

        await handler(req, res);

        // Verify successful exit
        expect(res.status).not.toHaveBeenCalledWith(500);

        // Verify headers for Excel download
        expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

        // Verify workbook and worksheet usage
        expect(mockWorkbookInstance.addWorksheet).toHaveBeenCalledWith('Batch Results');
        expect(mockWorksheet.columns.map((column) => column.key)).toEqual([
            'appVersion',
            'question',
            'answer',
            'rowIndex',
            'createdAt',
            'updatedAt',
            'lastAttemptAt'
        ]);
        expect(mockWorkbookInstance.xlsx.write).toHaveBeenCalledWith(res);
        expect(res.end).toHaveBeenCalled();
    });

    it('should prioritize core fields and analyzer columns before debug fields', async () => {
        req.query.format = 'excel';
        const mockItems = [{
            rowIndex: 7,
            status: 'completed',
            question: 'How did the answer change?',
            answer: 'Current answer',
            referenceAnswer: 'Reference answer',
            flagged: true,
            'analysisResults.similar-answer.status': 'flagged',
            'analysisResults.similar-answer.label': 'meaning-drift',
            'analysisResults.similar-answer.flagged': true,
            'analysisResults.similar-answer.differenceFound': true,
            'analysisResults.similar-answer.confidence': 0.91,
            'analysisResults.similar-answer.differenceExplanation': 'A deadline changed.',
            'analysisResults.similar-answer.changedFacts': [{ type: 'date', baseline: 'June 1, 2026', current: 'July 1, 2026' }],
            'analysisResults.similar-answer.referenceOnlyFacts': ['Reference fact'],
            'analysisResults.similar-answer.currentOnlyFacts': ['Current fact'],
            'analysisResults.similar-answer.ignoredDifferences': ['Tone'],
            referenceAnalysisResults: { debug: true },
            originalData: { raw: true },
            createdAt: new Date('2026-05-06T12:00:00.000Z')
        }];
        const findMock = {
            sort: vi.fn().mockReturnThis(),
            lean: vi.fn().mockResolvedValue(mockItems)
        };
        ExperimentalBatch.findById.mockReturnValue({
            select: vi.fn().mockReturnThis(),
            lean: vi.fn().mockResolvedValue({
                appVersion: 'v2.0.0',
                config: { analyzerId: 'similar-answer' }
            })
        });
        ExperimentalBatchItem.find.mockReturnValue(findMock);
        mockAnalyzerRegistry.get.mockResolvedValue({
            outputColumns: [
                'status',
                'label',
                'flagged',
                'differenceFound',
                'confidence',
                'differenceExplanation',
                'changedFacts',
                'referenceOnlyFacts',
                'currentOnlyFacts',
                'ignoredDifferences'
            ]
        });

        await handler(req, res);

        expect(mockWorksheet.columns.map((column) => column.key)).toEqual([
            'appVersion',
            'question',
            'answer',
            'referenceAnswer',
            'flagged',
            'analysisResults.similar-answer.status',
            'analysisResults.similar-answer.label',
            'analysisResults.similar-answer.confidence',
            'analysisResults.similar-answer.differenceExplanation',
            'analysisResults.similar-answer.changedFacts',
            'analysisResults.similar-answer.referenceOnlyFacts',
            'analysisResults.similar-answer.currentOnlyFacts',
            'analysisResults.similar-answer.ignoredDifferences',
            'analysisResults.similar-answer.flagged',
            'analysisResults.similar-answer.differenceFound',
            'rowIndex',
            'status',
            'referenceAnalysisResults',
            'originalData',
            'createdAt'
        ]);
    });

    it('should stringify nested analyzer output for Excel cells', async () => {
        req.query.format = 'excel';
        const mockItems = [{
            rowIndex: 1,
            question: 'A',
            'analysisResults.similar-answer.changedFacts': [
                {
                    type: 'date',
                    baseline: 'June 1, 2026',
                    current: 'July 1, 2026',
                    impact: 'Different filing deadline.'
                }
            ],
            createdAt: new Date('2026-05-06T12:00:00.000Z')
        }];
        const findMock = {
            sort: vi.fn().mockReturnThis(),
            lean: vi.fn().mockResolvedValue(mockItems)
        };
        ExperimentalBatchItem.find.mockReturnValue(findMock);

        await handler(req, res);

        expect(mockWorksheet.addRows).toHaveBeenCalledWith([
            expect.objectContaining({
                rowIndex: 1,
                question: 'A',
                'analysisResults.similar-answer.changedFacts': JSON.stringify([
                    {
                        type: 'date',
                        baseline: 'June 1, 2026',
                        current: 'July 1, 2026',
                        impact: 'Different filing deadline.'
                    }
                ])
            })
        ]);
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
