import { describe, it, expect, vi, beforeEach } from 'vitest';
import handler from '../experimental-suite-grid.js';
import { ExperimentalDataset } from '../../../models/experimentalDataset.js';
import { ExperimentalDatasetRow } from '../../../models/experimentalDatasetRow.js';
import { ExperimentalBatch } from '../../../models/experimentalBatch.js';
import { ExperimentalBatchItem } from '../../../models/experimentalBatchItem.js';

vi.mock('../../../models/experimentalDataset.js', () => ({
    ExperimentalDataset: { findById: vi.fn() }
}));
vi.mock('../../../models/experimentalDatasetRow.js', () => ({
    ExperimentalDatasetRow: { find: vi.fn() }
}));
vi.mock('../../../models/experimentalBatch.js', () => ({
    ExperimentalBatch: { find: vi.fn() }
}));
vi.mock('../../../models/experimentalBatchItem.js', () => ({
    ExperimentalBatchItem: { find: vi.fn() }
}));
vi.mock('../../../middleware/auth.js', () => ({
    authMiddleware: vi.fn((req, res, next) => next()),
    adminMiddleware: vi.fn((req, res, next) => next()),
    withProtection: vi.fn((handlerFn) => handlerFn)
}));

const DATASET_ID = '507f1f77bcf86cd799439011';
const RUN_ID = '507f1f77bcf86cd799439022';

const chainResolving = (value, methods) => {
    const chain = {};
    for (const method of methods) {
        chain[method] = vi.fn().mockReturnValue(chain);
    }
    chain.lean = vi.fn().mockResolvedValue(value);
    return chain;
};

describe('experimental-suite-grid API', () => {
    let req;
    let res;

    beforeEach(() => {
        req = { query: { datasetId: DATASET_ID } };
        res = { json: vi.fn(), status: vi.fn().mockReturnThis() };
        vi.clearAllMocks();
    });

    it('returns dataset, tests, runs and verdict cells', async () => {
        ExperimentalDataset.findById.mockReturnValue(
            chainResolving({ _id: DATASET_ID, name: 'CRA T2', category: 'cra' }, ['select'])
        );
        ExperimentalDatasetRow.find.mockReturnValue(
            chainResolving([
                { rowIndex: 1, data: { question: 'Q1', testName: 'control-1', caseType: 'Control' } },
                { rowIndex: 2, data: { question: 'Q2' } }
            ], ['sort'])
        );
        ExperimentalBatch.find.mockReturnValue(
            chainResolving([
                { _id: RUN_ID, name: 'Run 1', status: 'completed', createdAt: new Date() }
            ], ['select', 'sort', 'limit'])
        );
        ExperimentalBatchItem.find.mockReturnValue(
            chainResolving([
                { experimentalBatch: RUN_ID, rowIndex: 1, trialIndex: 1, status: 'completed', flagged: false, match: true },
                { experimentalBatch: RUN_ID, rowIndex: 2, trialIndex: 1, status: 'completed', flagged: true, match: false }
            ], ['select', 'sort'])
        );

        await handler(req, res);

        expect(res.json).toHaveBeenCalledWith({
            dataset: { _id: DATASET_ID, name: 'CRA T2', category: 'cra' },
            tests: [
                { position: 1, testName: 'control-1', caseType: 'control', question: 'Q1' },
                { position: 2, testName: 'Q2', caseType: '', question: 'Q2' }
            ],
            runs: [expect.objectContaining({ _id: RUN_ID })],
            cells: {
                [RUN_ID]: {
                    1: { verdict: 'pass', trials: ['pass'], passCount: 1, total: 1 },
                    2: { verdict: 'flagged', trials: ['flagged'], passCount: 0, total: 1 }
                }
            }
        });
    });

    it('aggregates multiple trials of a question into k/n cells', async () => {
        ExperimentalDataset.findById.mockReturnValue(
            chainResolving({ _id: DATASET_ID, name: 'Trials' }, ['select'])
        );
        ExperimentalDatasetRow.find.mockReturnValue(
            chainResolving([{ rowIndex: 1, data: { question: 'Q1' } }], ['sort'])
        );
        ExperimentalBatch.find.mockReturnValue(
            chainResolving([{ _id: RUN_ID, name: 'Run', status: 'completed', createdAt: new Date() }], ['select', 'sort', 'limit'])
        );
        ExperimentalBatchItem.find.mockReturnValue(
            chainResolving([
                { experimentalBatch: RUN_ID, rowIndex: 1, trialIndex: 1, status: 'completed', flagged: false, match: true },
                { experimentalBatch: RUN_ID, rowIndex: 1, trialIndex: 2, status: 'completed', flagged: true, match: false },
                { experimentalBatch: RUN_ID, rowIndex: 1, trialIndex: 3, status: 'completed', flagged: false, match: true }
            ], ['select', 'sort'])
        );

        await handler(req, res);

        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            cells: {
                [RUN_ID]: {
                    1: { verdict: 'mixed', trials: ['pass', 'flagged', 'pass'], passCount: 2, total: 3 }
                }
            }
        }));
    });

    it('returns empty cells when the dataset has no runs', async () => {
        ExperimentalDataset.findById.mockReturnValue(
            chainResolving({ _id: DATASET_ID, name: 'Empty' }, ['select'])
        );
        ExperimentalDatasetRow.find.mockReturnValue(chainResolving([], ['sort']));
        ExperimentalBatch.find.mockReturnValue(chainResolving([], ['select', 'sort', 'limit']));

        await handler(req, res);

        expect(ExperimentalBatchItem.find).not.toHaveBeenCalled();
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ tests: [], runs: [], cells: {} })
        );
    });

    it('returns 404 when the dataset does not exist', async () => {
        ExperimentalDataset.findById.mockReturnValue(chainResolving(null, ['select']));

        await handler(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith({ error: 'Dataset not found' });
    });

    it('returns 500 for an invalid datasetId', async () => {
        req.query.datasetId = 'nope';
        const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

        await handler(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({ error: 'Failed to load suite grid' });
        spy.mockRestore();
    });
});
