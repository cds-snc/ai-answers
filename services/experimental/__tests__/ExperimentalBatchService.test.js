import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import mongoose from 'mongoose';
import ExperimentalBatchService from '../ExperimentalBatchService.js';
import { ExperimentalBatch } from '../../../models/experimentalBatch.js';
import { ExperimentalBatchItem } from '../../../models/experimentalBatchItem.js';
import { ExperimentalDataset } from '../../../models/experimentalDataset.js';
import { ExperimentalDatasetRow } from '../../../models/experimentalDatasetRow.js';
import ExperimentalQueueService from '../ExperimentalQueueService.js';
import ExperimentalAnalyzerRegistry from '../ExperimentalAnalyzerRegistry.js';
import { getGraphApp } from '../../../agents/graphs/registry.js';

// Mock dependencies
vi.mock('../ExperimentalQueueService.js', () => ({
    default: {
        enqueue: vi.fn().mockResolvedValue({}),
        registerProcessor: vi.fn(),
        on: vi.fn()
    }
}));

vi.mock('../ExperimentalAnalyzerRegistry.js', () => ({
    default: {
        get: vi.fn(),
        initialize: vi.fn().mockResolvedValue()
    }
}));

vi.mock('../../../agents/graphs/registry.js', () => ({
    getGraphApp: vi.fn()
}));

describe('ExperimentalBatchService', () => {
    const userId = new mongoose.Types.ObjectId();

    beforeAll(async () => {
        const dbConnect = (await import('../../../api/db/db-connect.js')).default;
        await dbConnect();
    });

    afterEach(async () => {
        await ExperimentalBatch.deleteMany({});
        await ExperimentalBatchItem.deleteMany({});
        await ExperimentalDataset.deleteMany({});
        await ExperimentalDatasetRow.deleteMany({});
        vi.clearAllMocks();
    });

    describe('createBatch', () => {
        it('should create a batch with items from provided data', async () => {
            const batchData = { name: 'Test Batch', type: 'batch', createdBy: userId };
            const itemsData = [{ question: 'Q1' }, { question: 'Q2' }];

            const batch = await ExperimentalBatchService.createBatch(batchData, itemsData);

            expect(batch.status).toBe('pending');
            expect(batch.summary.total).toBe(2);

            const items = await ExperimentalBatchItem.find({ experimentalBatch: batch._id });
            expect(items).toHaveLength(2);
            expect(ExperimentalQueueService.enqueue).not.toHaveBeenCalled();
        });

        it('should load items from a dataset if itemsData is empty and datasetId is provided', async () => {
            const ds = await ExperimentalDataset.create({ name: 'My DS', type: 'question-only' });
            await ExperimentalDatasetRow.create([
                { experimentalDataset: ds._id, rowIndex: 1, data: { question: 'DQ1' } },
                { experimentalDataset: ds._id, rowIndex: 2, data: { question: 'DQ2' } }
            ]);

            const batchData = {
                name: 'Dataset Batch',
                type: 'analysis',
                config: { datasetId: ds._id.toString() }
            };

            const batch = await ExperimentalBatchService.createBatch(batchData, []);

            expect(batch.summary.total).toBe(2);
            const items = await ExperimentalBatchItem.find({ experimentalBatch: batch._id });
            expect(items[0].question).toBe('DQ1');
        });

        it('should map various field names to standardized item fields', async () => {
            const batchData = { name: 'Mapping Test', type: 'analysis' };
            const itemsData = [{
                Question: 'Standard Q',
                Answer: 'Standard A',
                baseline: 'Base',
                NewAnswer: 'Comp'
            }];

            const batch = await ExperimentalBatchService.createBatch(batchData, itemsData);
            const item = await ExperimentalBatchItem.findOne({ experimentalBatch: batch._id });

            expect(item.question).toBe('Standard Q');
            expect(item.answer).toBe('Standard A');
            expect(item.baselineAnswer).toBe('Base');
            expect(item.comparisonAnswer).toBe('Comp');
        });

        it('should extract referringUrl and chatId from provided data', async () => {
            const batchData = { name: 'Field Extraction', type: 'batch' };
            const itemsData = [{
                question: 'Q1',
                referringUrl: 'https://test.ca',
                chatId: 'chat-123'
            }];

            const batch = await ExperimentalBatchService.createBatch(batchData, itemsData);
            const item = await ExperimentalBatchItem.findOne({ experimentalBatch: batch._id });

            expect(item.referringUrl).toBe('https://test.ca');
            expect(item.chatId).toBe('chat-123');
        });

        it('should not enqueue items during createBatch (queued by batch-process)', async () => {
            const batchData = { name: 'Grouping Test', type: 'batch' };
            const itemsData = [
                { question: 'Chat 1 Turn 1', chatId: 'chat-A' },
                { question: 'Chat 1 Turn 2', chatId: 'chat-A' },
                { question: 'Independent Q', chatId: '' }
            ];

            await ExperimentalBatchService.createBatch(batchData, itemsData);

            expect(ExperimentalQueueService.enqueue).not.toHaveBeenCalled();
        });

        it('should reject invalid datasetId format', async () => {
            await expect(
                ExperimentalBatchService.createBatch(
                    { name: 'Invalid DS', type: 'analysis', config: { datasetId: 'not-an-objectid' } },
                    []
                )
            ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
        });

        it('should reject dataset-based create when dataset has no rows', async () => {
            const ds = await ExperimentalDataset.create({ name: 'Empty DS', type: 'question-only' });
            await expect(
                ExperimentalBatchService.createBatch(
                    { name: 'No Rows', type: 'analysis', config: { datasetId: ds._id.toString() } },
                    []
                )
            ).rejects.toMatchObject({ code: 'NO_ITEMS' });
        });
    });

    describe('cancelBatch', () => {
        it('should mark batch and pending items as cancelled', async () => {
            const batch = await ExperimentalBatch.create({ name: 'Running', type: 'batch', status: 'processing', summary: { total: 2 } });
            const item1 = await ExperimentalBatchItem.create({ experimentalBatch: batch._id, rowIndex: 1, status: 'pending' });
            const item2 = await ExperimentalBatchItem.create({ experimentalBatch: batch._id, rowIndex: 2, status: 'completed' });

            await ExperimentalBatchService.cancelBatch(batch._id);

            const updatedBatch = await ExperimentalBatch.findById(batch._id);
            expect(updatedBatch.status).toBe('cancelled');

            const updatedItem1 = await ExperimentalBatchItem.findById(item1._id);
            expect(updatedItem1.status).toBe('cancelled');

            const updatedItem2 = await ExperimentalBatchItem.findById(item2._id);
            expect(updatedItem2.status).toBe('completed'); // Stay completed
        });

        it('should reject cancel for terminal batch states', async () => {
            const batch = await ExperimentalBatch.create({ name: 'Done', type: 'batch', status: 'completed' });
            await expect(ExperimentalBatchService.cancelBatch(batch._id))
                .rejects.toMatchObject({ code: 'INVALID_STATE' });
        });
    });

    describe('_processItem - generation', () => {
        it('should run graph and update item with answer', async () => {
            const batch = await ExperimentalBatch.create({
                name: 'Gen Batch',
                type: 'batch',
                config: { workflow: 'TestGraph' }
            });
            const item = await ExperimentalBatchItem.create({
                experimentalBatch: batch._id,
                rowIndex: 1,
                question: 'What is 2+2?'
            });

            // Mock Graph
            const mockStream = {
                async *[Symbol.asyncIterator]() {
                    yield { result: { answer: 'It is 4' } };
                }
            };
            const mockApp = { stream: vi.fn().mockResolvedValue(mockStream) };
            getGraphApp.mockResolvedValue(mockApp);

            await ExperimentalBatchService._processItem(batch._id, item._id);

            const updatedItem = await ExperimentalBatchItem.findById(item._id);
            expect(updatedItem.status).toBe('completed');
            expect(updatedItem.answer).toBe('It is 4');
            expect(updatedItem.chatId).toBeDefined();
        });

        it('should build conversationHistory from previous turns and pass it to graph', async () => {
            const batch = await ExperimentalBatch.create({ name: 'History Batch', type: 'batch' });

            // Item 1 (Already completed)
            await ExperimentalBatchItem.create({
                experimentalBatch: batch._id,
                rowIndex: 1,
                chatId: 'multi-turn',
                question: 'First Q',
                answer: 'First A',
                status: 'completed'
            });

            // Item 2 (Processing now)
            const item2 = await ExperimentalBatchItem.create({
                experimentalBatch: batch._id,
                rowIndex: 2,
                chatId: 'multi-turn',
                question: 'Second Q',
                status: 'pending'
            });

            const mockStream = { async *[Symbol.asyncIterator]() { yield { result: { answer: 'Second A' } }; } };
            const mockApp = { stream: vi.fn().mockResolvedValue(mockStream) };
            getGraphApp.mockResolvedValue(mockApp);

            await ExperimentalBatchService._processItem(batch._id, item2._id);

            expect(mockApp.stream).toHaveBeenCalledWith(
                expect.objectContaining({
                    conversationHistory: [
                        { role: 'user', content: 'First Q' },
                        { role: 'assistant', content: 'First A' }
                    ]
                }),
                expect.any(Object)
            );
        });

        it('should priority referringUrl from item over batch config', async () => {
            const batch = await ExperimentalBatch.create({
                name: 'URL Priority',
                type: 'batch',
                config: { referringUrl: 'https://batch.ca' }
            });
            const item = await ExperimentalBatchItem.create({
                experimentalBatch: batch._id,
                rowIndex: 1,
                question: 'Q',
                referringUrl: 'https://item.ca'
            });

            const mockStream = { async *[Symbol.asyncIterator]() { yield { result: { answer: 'A' } }; } };
            const mockApp = { stream: vi.fn().mockResolvedValue(mockStream) };
            getGraphApp.mockResolvedValue(mockApp);

            await ExperimentalBatchService._processItem(batch._id, item._id);

            expect(mockApp.stream).toHaveBeenCalledWith(
                expect.objectContaining({ referringUrl: 'https://item.ca' }),
                expect.any(Object)
            );
        });

        it('should enqueue the next turn in a chat group after completion', async () => {
            const batch = await ExperimentalBatch.create({ name: 'Stepper Batch', type: 'batch' });
            const item1 = await ExperimentalBatchItem.create({
                experimentalBatch: batch._id,
                rowIndex: 1,
                chatId: 'consecutive',
                status: 'pending'
            });
            const item2 = await ExperimentalBatchItem.create({
                experimentalBatch: batch._id,
                rowIndex: 2,
                chatId: 'consecutive',
                status: 'pending'
            });

            const mockStream = { async *[Symbol.asyncIterator]() { yield { result: { answer: 'A' } }; } };
            const mockApp = { stream: vi.fn().mockResolvedValue(mockStream) };
            getGraphApp.mockResolvedValue(mockApp);

            await ExperimentalBatchService._processItem(batch._id, item1._id);

            // Should have been enqueued once during setup (mocked manually here) 
            // but the internal call inside _processItem should call it again for item 2
            expect(ExperimentalQueueService.enqueue).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
                itemId: item2._id.toString()
            }));
        });

        it('should not process an item that is already completed', async () => {
            const batch = await ExperimentalBatch.create({ name: 'No Reprocess', type: 'batch' });
            const item = await ExperimentalBatchItem.create({
                experimentalBatch: batch._id,
                rowIndex: 1,
                status: 'completed',
                answer: 'existing'
            });

            await ExperimentalBatchService._processItem(batch._id, item._id);

            expect(getGraphApp).not.toHaveBeenCalled();
            const unchanged = await ExperimentalBatchItem.findById(item._id);
            expect(unchanged.status).toBe('completed');
            expect(unchanged.answer).toBe('existing');
        });
    });

    describe('_processItem - analysis', () => {
        it('should run registered analyzers and store results', async () => {
            const batch = await ExperimentalBatch.create({
                name: 'Analysis Batch',
                type: 'analysis',
                config: { analyzerIds: ['expert-scorer'] }
            });
            const item = await ExperimentalBatchItem.create({
                experimentalBatch: batch._id,
                rowIndex: 1,
                question: 'Q',
                answer: 'A'
            });

            const mockAnalyzer = {
                id: 'expert-scorer',
                processor: vi.fn().mockResolvedValue({ verdict: 'pass', score: 0.9 })
            };
            ExperimentalAnalyzerRegistry.get.mockResolvedValue(mockAnalyzer);

            await ExperimentalBatchService._processItem(batch._id, item._id);

            const updatedItem = await ExperimentalBatchItem.findById(item._id);
            expect(updatedItem.analysisResults['expert-scorer']).toEqual({ verdict: 'pass', score: 0.9 });
            expect(updatedItem.match).toBe(true);
        });

        it('should handle analyzer errors gracefully', async () => {
            const batch = await ExperimentalBatch.create({
                name: 'Error Batch',
                type: 'analysis',
                config: { analyzerId: 'failing-analyzer' }
            });
            const item = await ExperimentalBatchItem.create({ experimentalBatch: batch._id, rowIndex: 1 });

            ExperimentalAnalyzerRegistry.get.mockResolvedValue({
                id: 'failing-analyzer',
                processor: vi.fn().mockRejectedValue(new Error('Analyzer Crash'))
            });

            await ExperimentalBatchService._processItem(batch._id, item._id);

            const updatedItem = await ExperimentalBatchItem.findById(item._id);
            expect(updatedItem.analysisErrors['failing-analyzer'].code).toBe('ANALYSIS_FAILED');
        });

        it('should persist the resolved answer when item has no pre-existing answer', async () => {
            // REGRESSION TEST: When an analysis-type batch item has answer: '',
            // _processItem uses `item.answer || item.question` to run the analyzer,
            // but the resolved value must also be saved back to item.answer in the DB.
            // Previously the export would always show answer: '' even after analysis ran.
            const batch = await ExperimentalBatch.create({
                name: 'No-Answer Analysis Batch',
                type: 'analysis',
                config: { analyzerIds: ['bias-detection'] }
            });
            const item = await ExperimentalBatchItem.create({
                experimentalBatch: batch._id,
                rowIndex: 1,
                question: 'How to find job in Canada?',
                answer: ''
            });

            ExperimentalAnalyzerRegistry.get.mockResolvedValue({
                id: 'bias-detection',
                processor: vi.fn().mockResolvedValue({ status: 'pass', score: 1 })
            });

            await ExperimentalBatchService._processItem(batch._id, item._id);

            const updatedItem = await ExperimentalBatchItem.findById(item._id);
            expect(updatedItem.status).toBe('completed');
            expect(updatedItem.answer).toBe('How to find job in Canada?');
        });
    });

    describe('promoteToDataset', () => {
        it('should create a dataset from batch outcomes', async () => {
            const batch = await ExperimentalBatch.create({
                name: 'To Promote',
                type: 'analysis',
                status: 'completed',
                summary: { total: 1 }
            });
            await ExperimentalBatchItem.create({
                experimentalBatch: batch._id,
                rowIndex: 1,
                status: 'completed',
                question: 'PQ1',
                answer: 'PA1',
                analysisResults: { 'foo': { bar: 1 } }
            });

            const result = await ExperimentalBatchService.promoteToDataset(batch._id, {
                name: 'New Promoted DS',
                userId
            });

            expect(result.dataset.name).toBe('New Promoted DS');
            expect(result.dataset.rowCount).toBe(1);

            const rows = await ExperimentalDatasetRow.find({ experimentalDataset: result.dataset._id });
            expect(rows[0].data.question).toBe('PQ1');
            expect(rows[0].data.analysisResults.foo.bar).toBe(1);
        });

        it('should preserve referringUrl and chatId during promotion', async () => {
            const batch = await ExperimentalBatch.create({ name: 'Preserve', type: 'batch', status: 'completed', summary: { total: 1 } });
            await ExperimentalBatchItem.create({
                experimentalBatch: batch._id,
                rowIndex: 1,
                status: 'completed',
                referringUrl: 'https://promoted.ca',
                chatId: 'promoted-chat',
                question: 'Q'
            });

            const result = await ExperimentalBatchService.promoteToDataset(batch._id, { name: 'Preserved DS', userId });
            const rows = await ExperimentalDatasetRow.find({ experimentalDataset: result.dataset._id });

            expect(rows[0].data.referringUrl).toBe('https://promoted.ca');
            expect(rows[0].data.chatId).toBe('promoted-chat');
        });

        it('should cleanup if row creation fails', async () => {
            const batch = await ExperimentalBatch.create({
                name: 'Cleanup Batch Service',
                type: 'analysis',
                status: 'completed'
            });
            await ExperimentalBatchItem.create({ experimentalBatch: batch._id, rowIndex: 1 });

            const spy = vi.spyOn(ExperimentalDatasetRow, 'insertMany').mockRejectedValue(new Error('Fail Cleanup'));

            await expect(ExperimentalBatchService.promoteToDataset(batch._id, { name: 'Cleanup DS Service', userId }))
                .rejects.toThrow('Fail Cleanup');

            const ds = await ExperimentalDataset.findOne({ name: 'Cleanup DS Service' });
            expect(ds).toBeNull();

            spy.mockRestore();
        });
    });

    describe('_updateBatchSummary', () => {
        it('should mark batch completed when only refused items remain', async () => {
            const batch = await ExperimentalBatch.create({
                name: 'Refused Summary',
                type: 'analysis',
                status: 'processing'
            });

            await ExperimentalBatchItem.create({
                experimentalBatch: batch._id,
                rowIndex: 1,
                status: 'refused'
            });

            await ExperimentalBatchService._updateBatchSummary(batch._id);

            const updated = await ExperimentalBatch.findById(batch._id);
            expect(updated.status).toBe('completed');
            expect(updated.summary.failed).toBe(1);
        });
    });
});
