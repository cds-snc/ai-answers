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
import { graphRequestContext } from '../../../agents/graphs/requestContext.js';

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
        get: vi.fn().mockImplementation((id) => {
            if (id === 'expert-scorer') {
                return {
                    id: 'expert-scorer',
                    inputType: 'comparison',
                    validateBatch: (items) => {
                        const hasReference = items.some((item) =>
                            ['baselineAnswer', 'BaselineAnswer', 'baseline', 'GoldenAnswer', 'goldenAnswer']
                                .some((alias) => String(item?.[alias] || '').trim() !== '')
                        );
                        return hasReference
                            ? { valid: true }
                            : { valid: false, code: 'NO_REFERENCE', localeKey: 'experimental.analysis.messages.error.NO_REFERENCE_EXPERT_SCORER' };
                    }
                };
            }
            return undefined;
        }),
        initialize: vi.fn().mockResolvedValue()
    }
}));

vi.mock('../../../agents/graphs/registry.js', () => ({
    getGraphApp: vi.fn()
}));

describe('ExperimentalBatchService', () => {
    const userId = new mongoose.Types.ObjectId();
    const originalAppVersion = process.env.APP_VERSION;

    beforeAll(async () => {
        const dbConnect = (await import('../../../api/db/db-connect.js')).default;
        await dbConnect();
    });

    afterEach(async () => {
        await ExperimentalBatch.deleteMany({});
        await ExperimentalBatchItem.deleteMany({});
        await ExperimentalDataset.deleteMany({});
        await ExperimentalDatasetRow.deleteMany({});
        if (originalAppVersion === undefined) {
            delete process.env.APP_VERSION;
        } else {
            process.env.APP_VERSION = originalAppVersion;
        }
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

        it('should persist the app version on new batches', async () => {
            process.env.APP_VERSION = 'v-test-batch';
            const batchData = { name: 'Versioned Batch', type: 'batch', createdBy: userId };
            const itemsData = [{ question: 'Q1' }];

            const batch = await ExperimentalBatchService.createBatch(batchData, itemsData);
            const saved = await ExperimentalBatch.findById(batch._id).lean();

            expect(batch.appVersion).toBe('v-test-batch');
            expect(saved.appVersion).toBe('v-test-batch');
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
                config: { datasetId: ds._id.toString(), analyzerId: 'refusal' }
            };

            const batch = await ExperimentalBatchService.createBatch(batchData, []);

            expect(batch.summary.total).toBe(2);
            const items = await ExperimentalBatchItem.find({ experimentalBatch: batch._id });
            expect(items[0].question).toBe('DQ1');
        });

        it('should map various field names to standardized item fields', async () => {
            const batchData = { name: 'Mapping Test', type: 'analysis', config: { analyzerId: 'refusal' } };
            const itemsData = [{
                Question: 'Standard Q',
                Response: 'Standard A',
                baselineAnswer: 'Base',
                NewAnswer: 'Comp'
            }];

            const batch = await ExperimentalBatchService.createBatch(batchData, itemsData);
            const item = await ExperimentalBatchItem.findOne({ experimentalBatch: batch._id });

            expect(item.question).toBe('Standard Q');
            expect(item.answer).toBe('Standard A');
            expect(item.baselineAnswer).toBe('Base');
        });

        it('should map the accepted baseline answer column names to baselineAnswer', async () => {
            const batchData = { name: 'Baseline Mapping Test', type: 'analysis', config: { analyzerId: 'refusal' } };
            const itemsData = [
                { question: 'Q1', GoldenAnswer: 'Expert answer 1' },
                { question: 'Q2', goldenAnswer: 'Expert answer 2' },
                { question: 'Q3', BaselineAnswer: 'Expert answer 3' },
                { question: 'Q4', baseline: 'Expert answer 4' }
            ];

            const batch = await ExperimentalBatchService.createBatch(batchData, itemsData);
            const items = await ExperimentalBatchItem.find({ experimentalBatch: batch._id }).sort({ rowIndex: 1 });

            expect(items.map(i => i.baselineAnswer)).toEqual([
                'Expert answer 1',
                'Expert answer 2',
                'Expert answer 3',
                'Expert answer 4'
            ]);
            // Baseline answers land in the reference slot only — the current
            // answer stays empty so processing generates a fresh one to compare.
            expect(items.every(i => !i.answer)).toBe(true);
        });

        it('should expand each question into n items when config.trials is set', async () => {
            const batchData = {
                name: 'Trials Test',
                type: 'analysis',
                config: { analyzerId: 'expert-scorer', trials: 3 }
            };
            const itemsData = [
                { question: 'Q1', GoldenAnswer: 'Golden 1' },
                { question: 'Q2', GoldenAnswer: 'Golden 2' }
            ];

            const batch = await ExperimentalBatchService.createBatch(batchData, itemsData);
            const items = await ExperimentalBatchItem.find({ experimentalBatch: batch._id }).sort({ rowIndex: 1, trialIndex: 1 });

            expect(batch.summary.total).toBe(6);
            expect(items).toHaveLength(6);
            expect(items.map(i => [i.rowIndex, i.trialIndex])).toEqual([
                [1, 1], [1, 2], [1, 3],
                [2, 1], [2, 2], [2, 3]
            ]);
            // Every trial carries the reference answer but is its own conversation
            expect(items.every(i => i.baselineAnswer.startsWith('Golden'))).toBe(true);
            const chatIds = new Set(items.map(i => i.chatId));
            expect(chatIds.size).toBe(6);
        });

        it('should keep multi-turn conversations threaded within each trial', async () => {
            const batchData = {
                name: 'Multi-turn Trials Test',
                type: 'analysis',
                config: { analyzerId: 'similar-answer', trials: 2 }
            };
            // Two rows sharing a source chatId = one two-turn conversation
            const itemsData = [
                { question: 'Turn 1', chatId: 'source-conv-1' },
                { question: 'Turn 2', chatId: 'source-conv-1' }
            ];

            const batch = await ExperimentalBatchService.createBatch(batchData, itemsData);
            const items = await ExperimentalBatchItem.find({ experimentalBatch: batch._id }).sort({ rowIndex: 1, trialIndex: 1 });

            const trial1 = items.filter(i => i.trialIndex === 1);
            const trial2 = items.filter(i => i.trialIndex === 2);

            // Within a trial, both turns share one conversation
            expect(trial1[0].chatId).toBe(trial1[1].chatId);
            expect(trial2[0].chatId).toBe(trial2[1].chatId);
            // Across trials, the conversations are independent
            expect(trial1[0].chatId).not.toBe(trial2[0].chatId);
        });

        it('should clamp trials to the allowed range', async () => {
            const batchData = {
                name: 'Trials Clamp Test',
                type: 'analysis',
                config: { analyzerId: 'similar-answer', trials: 99 }
            };

            const batch = await ExperimentalBatchService.createBatch(batchData, [{ question: 'Q1' }]);
            const items = await ExperimentalBatchItem.find({ experimentalBatch: batch._id });

            expect(batch.config.trials).toBe(8);
            expect(items).toHaveLength(8);
        });

        it('should reject expert-scorer runs without a reference answer', async () => {
            await expect(ExperimentalBatchService.createBatch(
                { name: 'No Reference', type: 'analysis', config: { analyzerId: 'expert-scorer' } },
                [{ question: 'Q1' }]
            )).rejects.toMatchObject({ code: 'NO_REFERENCE' });
        });

        it('should accept a no-analyzer capture run as baseline for any analyzer', async () => {
            const ds = await ExperimentalDataset.create({ name: 'Capture DS', type: 'question-only' });
            await ExperimentalDatasetRow.create([
                { experimentalDataset: ds._id, rowIndex: 1, data: { question: 'Q1' } }
            ]);

            const captureBatch = await ExperimentalBatch.create({
                name: 'Capture',
                type: 'analysis',
                status: 'completed',
                config: { analyzerId: 'no-analyzer', datasetId: ds._id }
            });
            await ExperimentalBatchItem.create([
                { experimentalBatch: captureBatch._id, rowIndex: 1, trialIndex: 1, question: 'Q1', answer: 'Captured answer', status: 'completed' }
            ]);

            const batch = await ExperimentalBatchService.createBatch({
                name: 'Scored run',
                type: 'analysis',
                config: {
                    analyzerId: 'expert-scorer',
                    datasetId: ds._id.toString(),
                    baselineRunId: captureBatch._id.toString()
                }
            }, []);

            const items = await ExperimentalBatchItem.find({ experimentalBatch: batch._id });
            expect(items[0].baselineAnswer).toBe('Captured answer');
        });

        it('should use the first trial per question when the baseline run had trials', async () => {
            const ds = await ExperimentalDataset.create({ name: 'Drift DS', type: 'question-only' });
            await ExperimentalDatasetRow.create([
                { experimentalDataset: ds._id, rowIndex: 1, data: { question: 'Q1' } },
                { experimentalDataset: ds._id, rowIndex: 2, data: { question: 'Q2' } }
            ]);

            const baselineBatch = await ExperimentalBatch.create({
                name: 'Baseline with trials',
                type: 'analysis',
                status: 'completed',
                config: { analyzerId: 'similar-answer', datasetId: ds._id, trials: 2 }
            });
            await ExperimentalBatchItem.create([
                { experimentalBatch: baselineBatch._id, rowIndex: 1, trialIndex: 1, question: 'Q1', answer: 'Q1 trial 1', status: 'completed' },
                { experimentalBatch: baselineBatch._id, rowIndex: 1, trialIndex: 2, question: 'Q1', answer: 'Q1 trial 2', status: 'completed' },
                { experimentalBatch: baselineBatch._id, rowIndex: 2, trialIndex: 1, question: 'Q2', answer: 'Q2 trial 1', status: 'completed' },
                { experimentalBatch: baselineBatch._id, rowIndex: 2, trialIndex: 2, question: 'Q2', answer: 'Q2 trial 2', status: 'completed' }
            ]);

            const batch = await ExperimentalBatchService.createBatch({
                name: 'Drift run',
                type: 'analysis',
                config: {
                    analyzerId: 'similar-answer',
                    datasetId: ds._id.toString(),
                    baselineRunId: baselineBatch._id.toString(),
                    trials: 2
                }
            }, []);

            const items = await ExperimentalBatchItem.find({ experimentalBatch: batch._id }).sort({ rowIndex: 1, trialIndex: 1 });

            // Every trial of a question compares against that question's
            // first baseline trial — never a neighbouring question's answer.
            expect(items.map(i => [i.rowIndex, i.trialIndex, i.baselineAnswer])).toEqual([
                [1, 1, 'Q1 trial 1'],
                [1, 2, 'Q1 trial 1'],
                [2, 1, 'Q2 trial 1'],
                [2, 2, 'Q2 trial 1']
            ]);
        });

        it('should not map unrecognized golden column variants', async () => {
            const batchData = { name: 'Golden Negative Test', type: 'analysis', config: { analyzerId: 'similar-answer' } };
            const itemsData = [
                { question: 'Q1', 'golden answer': 'Spaced name' },
                { question: 'Q2', golden_answer: 'Underscored name' }
            ];

            const batch = await ExperimentalBatchService.createBatch(batchData, itemsData);
            const items = await ExperimentalBatchItem.find({ experimentalBatch: batch._id }).sort({ rowIndex: 1 });

            expect(items.every(i => !i.baselineAnswer)).toBe(true);
        });

        it('should not invent a model family when none is explicitly provided', async () => {
            const batchData = { name: 'Blank Model', type: 'analysis', config: { analyzerId: 'refusal' } };
            const itemsData = [{ question: 'Q1' }];

            const batch = await ExperimentalBatchService.createBatch(batchData, itemsData);
            const saved = await ExperimentalBatch.findById(batch._id).lean();

            expect(saved.config.aiProvider).toBeUndefined();
        });

        it('should generate current chatId without overwriting source chatId in originalData', async () => {
            const batchData = { name: 'Field Extraction', type: 'batch' };
            const itemsData = [{
                question: 'Q1',
                referringUrl: 'https://test.ca',
                chatId: 'chat-123'
            }];

            const batch = await ExperimentalBatchService.createBatch(batchData, itemsData);
            const item = await ExperimentalBatchItem.findOne({ experimentalBatch: batch._id });

            expect(item.referringUrl).toBe('https://test.ca');
            expect(item.originalData.chatId).toBe('chat-123');
            expect(item.chatId).toBeTruthy();
            expect(item.chatId).not.toBe('chat-123');
        });

        it('should normalize chatId and referringUrl aliases when creating items', async () => {
            const batchData = { name: 'Alias Extraction', type: 'batch' };
            const itemsData = [{
                originalData: {
                    'Problem Details': 'Q1',
                    ChatId: 'chat-alias-123',
                    URL: 'https://alias.test'
                }
            }];

            const batch = await ExperimentalBatchService.createBatch(batchData, itemsData);
            const item = await ExperimentalBatchItem.findOne({ experimentalBatch: batch._id });

            expect(item.question).toBe('Q1');
            expect(item.referringUrl).toBe('https://alias.test');
            expect(item.originalData.originalData.ChatId).toBe('chat-alias-123');
            expect(item.chatId).toBeTruthy();
            expect(item.chatId).not.toBe('chat-alias-123');
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
                    { name: 'No Rows', type: 'analysis', config: { datasetId: ds._id.toString(), analyzerId: 'refusal' } },
                    []
                )
            ).rejects.toMatchObject({ code: 'NO_ITEMS' });
        });

        it('should require exactly one analyzer for analysis runs', async () => {
            await expect(
                ExperimentalBatchService.createBatch(
                    {
                        name: 'Too Many Analyzers',
                        type: 'analysis',
                        config: { analyzerIds: ['refusal', 'expert-scorer'] }
                    },
                    [{ question: 'Q1' }]
                )
            ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
        });

        it('should reject baseline comparisons when analyzer ids differ', async () => {
            const ds = await ExperimentalDataset.create({ name: 'Baseline DS', type: 'question-only' });
            await ExperimentalDatasetRow.create({
                experimentalDataset: ds._id,
                rowIndex: 1,
                data: { question: 'Q baseline' }
            });

            const baselineBatch = await ExperimentalBatch.create({
                name: 'Baseline',
                type: 'analysis',
                config: { analyzerId: 'refusal', datasetId: ds._id }
            });
            await ExperimentalBatchItem.create({
                experimentalBatch: baselineBatch._id,
                rowIndex: 1,
                question: 'Q baseline',
                answer: 'A baseline',
                status: 'completed'
            });

            await expect(
                ExperimentalBatchService.createBatch(
                    {
                        name: 'Mismatch Baseline',
                        type: 'analysis',
                        config: {
                            analyzerId: 'expert-scorer',
                            datasetId: ds._id.toString(),
                            baselineRunId: baselineBatch._id.toString()
                        }
                    },
                    []
                )
            ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
        });

        it('should copy baseline metadata without treating the baseline answer as the current answer', async () => {
            const ds = await ExperimentalDataset.create({ name: 'Baseline Chat DS', type: 'question-only' });
            await ExperimentalDatasetRow.create({
                experimentalDataset: ds._id,
                rowIndex: 1,
                data: { question: 'Q baseline' }
            });

            const baselineBatch = await ExperimentalBatch.create({
                name: 'Baseline chat run',
                type: 'analysis',
                config: { analyzerId: 'bias-detection', datasetId: ds._id }
            });
            await ExperimentalBatchItem.create({
                experimentalBatch: baselineBatch._id,
                rowIndex: 1,
                question: 'Q baseline',
                answer: 'A baseline',
                chatId: 'chat-baseline-123',
                status: 'completed'
            });

            const batch = await ExperimentalBatchService.createBatch(
                {
                    name: 'Comparison run',
                    type: 'analysis',
                    config: {
                        analyzerId: 'bias-detection',
                        datasetId: ds._id.toString(),
                        baselineRunId: baselineBatch._id.toString()
                    }
                },
                []
            );

            const item = await ExperimentalBatchItem.findOne({ experimentalBatch: batch._id }).lean();
            expect(item.chatId).toBeTruthy();
            expect(item.chatId).not.toBe('chat-baseline-123');
            expect(item.baselineChatId).toBe('chat-baseline-123');
            expect(item.answer).toBe('');
            expect(item.baselineAnswer).toBe('A baseline');
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
                config: { workflow: 'TestGraph', pageLanguage: 'en', aiProvider: 'azure' }
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
            const runSpy = vi.spyOn(graphRequestContext, 'run').mockImplementation((store, callback) => callback());

            await ExperimentalBatchService._processItem(batch._id, item._id);

            expect(mockApp.stream).toHaveBeenCalledWith(
                expect.objectContaining({
                    userMessage: 'What is 2+2?',
                    lang: 'en',
                    selectedAI: 'azure',
                    searchProvider: 'google'
                }),
                expect.any(Object)
            );
            expect(runSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    user: null
                }),
                expect.any(Function)
            );

            const updatedItem = await ExperimentalBatchItem.findById(item._id);
            expect(updatedItem.status).toBe('completed');
            expect(updatedItem.answer).toBe('It is 4');
            expect(updatedItem.chatId).toBeDefined();
            runSpy.mockRestore();
        });

        it('should resolve DefaultGraph to the generic registry graph', async () => {
            const batch = await ExperimentalBatch.create({
                name: 'Default Graph Batch',
                type: 'batch',
                config: { workflow: 'DefaultGraph', pageLanguage: 'en', aiProvider: 'azure' }
            });
            const item = await ExperimentalBatchItem.create({
                experimentalBatch: batch._id,
                rowIndex: 1,
                question: 'What is 2+2?'
            });

            const mockStream = {
                async *[Symbol.asyncIterator]() {
                    yield { result: { answer: 'It is 4' } };
                }
            };
            const mockApp = { stream: vi.fn().mockResolvedValue(mockStream) };
            getGraphApp.mockResolvedValue(mockApp);
            const runSpy = vi.spyOn(graphRequestContext, 'run').mockImplementation((store, callback) => callback());

            await ExperimentalBatchService._processItem(batch._id, item._id);

            expect(getGraphApp).toHaveBeenCalledWith('GenericWorkflowGraph');
            runSpy.mockRestore();
        });

        it('should seed graph request context with the batch starter user', async () => {
            const starterId = new mongoose.Types.ObjectId();
            const batch = await ExperimentalBatch.create({
                name: 'Starter User Batch',
                type: 'batch',
                createdBy: starterId,
                config: { workflow: 'TestGraph', pageLanguage: 'en', aiProvider: 'azure', searchProvider: 'google' }
            });
            const item = await ExperimentalBatchItem.create({
                experimentalBatch: batch._id,
                rowIndex: 1,
                question: 'What is 2+2?'
            });

            const mockStream = {
                async *[Symbol.asyncIterator]() {
                    yield { result: { answer: 'It is 4' } };
                }
            };
            const mockApp = { stream: vi.fn().mockResolvedValue(mockStream) };
            getGraphApp.mockResolvedValue(mockApp);
            const runSpy = vi.spyOn(graphRequestContext, 'run').mockImplementation((store, callback) => callback());

            await ExperimentalBatchService._processItem(batch._id, item._id);

            expect(runSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    user: expect.objectContaining({ userId: starterId.toString() })
                }),
                expect.any(Function)
            );
            runSpy.mockRestore();
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
                        {
                            sender: 'ai',
                            text: 'First A',
                            interaction: {
                                question: 'First Q',
                                answer: { content: 'First A' },
                                context: null
                            }
                        }
                    ]
                }),
                expect.any(Object)
            );
        });

        it('should preserve original dataset chatId when creating a baseline comparison run', async () => {
            const ds = await ExperimentalDataset.create({ name: 'Original Chat DS', type: 'question-only' });
            await ExperimentalDatasetRow.create({
                experimentalDataset: ds._id,
                rowIndex: 1,
                data: { question: 'What is SCIS?', ChatId: '1234' }
            });

            const baselineBatch = await ExperimentalBatch.create({
                name: 'Baseline run',
                type: 'analysis',
                config: { analyzerId: 'similar-answer', datasetId: ds._id }
            });
            await ExperimentalBatchItem.create({
                experimentalBatch: baselineBatch._id,
                rowIndex: 1,
                question: 'What is SCIS?',
                answer: 'Baseline answer',
                chatId: 'generated-baseline-chat-id',
                status: 'completed'
            });

            const comparisonBatch = await ExperimentalBatchService.createBatch(
                {
                    name: 'Comparison run',
                    type: 'analysis',
                    config: {
                        analyzerId: 'similar-answer',
                        datasetId: ds._id.toString(),
                        baselineRunId: baselineBatch._id.toString()
                    }
                },
                []
            );

            const item = await ExperimentalBatchItem.findOne({ experimentalBatch: comparisonBatch._id }).lean();
            expect(item.originalData.chatId || item.originalData.ChatId).toBe('1234');
            expect(item.chatId).toBeTruthy();
            expect(item.chatId).not.toBe('1234');
            expect(item.chatId).not.toBe('generated-baseline-chat-id');
            expect(item.baselineChatId).toBe('generated-baseline-chat-id');
        });

        it('should pass prior turns to the workflow in a multi-turn baseline comparison with similar-answer analyzer', async () => {
            const ds = await ExperimentalDataset.create({ name: 'Multi Turn Comparison DS', type: 'question-only' });
            await ExperimentalDatasetRow.create([
                {
                    experimentalDataset: ds._id,
                    rowIndex: 1,
                    data: { question: 'What is SCIS?', ChatId: '1234', URL: 'https://www.sac-isc.gc.ca' }
                },
                {
                    experimentalDataset: ds._id,
                    rowIndex: 2,
                    data: { question: 'Where do I find the forms?', ChatId: '1234', URL: 'https://www.sac-isc.gc.ca' }
                }
            ]);

            const baselineBatch = await ExperimentalBatch.create({
                name: 'Baseline multi-turn run',
                type: 'analysis',
                config: { analyzerId: 'similar-answer', datasetId: ds._id }
            });
            await ExperimentalBatchItem.create([
                {
                    experimentalBatch: baselineBatch._id,
                    rowIndex: 1,
                    question: 'What is SCIS?',
                    answer: 'Baseline answer 1',
                    chatId: 'generated-baseline-chat-1',
                    status: 'completed'
                },
                {
                    experimentalBatch: baselineBatch._id,
                    rowIndex: 2,
                    question: 'Where do I find the forms?',
                    answer: 'Baseline answer 2',
                    chatId: 'generated-baseline-chat-2',
                    status: 'completed'
                }
            ]);

            const comparisonBatch = await ExperimentalBatchService.createBatch(
                {
                    name: 'Comparison multi-turn run',
                    type: 'analysis',
                    config: {
                        analyzerId: 'similar-answer',
                        workflow: 'TestGraph',
                        datasetId: ds._id.toString(),
                        baselineRunId: baselineBatch._id.toString()
                    }
                },
                []
            );

            const items = await ExperimentalBatchItem.find({ experimentalBatch: comparisonBatch._id }).sort({ rowIndex: 1 });
            expect(items.map(item => item.originalData.chatId || item.originalData.ChatId)).toEqual(['1234', '1234']);
            expect(items[0].chatId).toBeTruthy();
            expect(items[0].chatId).toBe(items[1].chatId);
            expect(items[0].chatId).not.toBe('1234');
            expect(items[0].chatId).not.toBe('generated-baseline-chat-1');
            expect(items[0].chatId).not.toBe('generated-baseline-chat-2');
            expect(items.map(item => item.baselineChatId)).toEqual(['generated-baseline-chat-1', 'generated-baseline-chat-2']);

            const mockApp = {
                stream: vi.fn()
                    .mockResolvedValueOnce({
                        async *[Symbol.asyncIterator]() {
                            yield { result: { answer: { content: 'Current answer 1' } } };
                        }
                    })
                    .mockResolvedValueOnce({
                        async *[Symbol.asyncIterator]() {
                            yield { result: { answer: { content: 'Current answer 2' } } };
                        }
                    })
            };
            getGraphApp.mockResolvedValue(mockApp);
            ExperimentalAnalyzerRegistry.get.mockResolvedValue({
                id: 'similar-answer',
                processor: vi.fn().mockResolvedValue({ status: 'pass', differenceFound: false })
            });

            await ExperimentalBatchService._processItem(comparisonBatch._id, items[0]._id);
            await ExperimentalBatchService._processItem(comparisonBatch._id, items[1]._id);

            expect(mockApp.stream).toHaveBeenNthCalledWith(
                2,
                expect.objectContaining({
                    chatId: items[0].chatId,
                    userMessage: 'Where do I find the forms?',
                    referringUrl: 'https://www.sac-isc.gc.ca',
                    conversationHistory: [
                        {
                            sender: 'ai',
                            text: 'Current answer 1',
                            interaction: {
                                question: 'What is SCIS?',
                                answer: { content: 'Current answer 1' },
                                context: null
                            }
                        }
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
            item.answer = 'Pre-existing answer';
            await item.save();

            ExperimentalAnalyzerRegistry.get.mockResolvedValue({
                id: 'failing-analyzer',
                processor: vi.fn().mockRejectedValue(new Error('Analyzer Crash'))
            });

            await ExperimentalBatchService._processItem(batch._id, item._id);

            const updatedItem = await ExperimentalBatchItem.findById(item._id);
            expect(updatedItem.analysisErrors['failing-analyzer'].code).toBe('ANALYSIS_FAILED');
        });

        it('should generate and persist answer when analysis item has no pre-existing answer', async () => {
            // REGRESSION TEST: question-only analysis rows should get a generated answer
            // before analyzers run so exports include a real answer.
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

            const mockStream = {
                async *[Symbol.asyncIterator]() {
                    yield {
                        verifyNode: {
                            result: {
                                answer: {
                                    content: 'Generated analysis answer'
                                }
                            }
                        }
                    };
                }
            };
            const mockApp = { stream: vi.fn().mockResolvedValue(mockStream) };
            getGraphApp.mockResolvedValue(mockApp);

            const processor = vi.fn().mockResolvedValue({ status: 'pass', score: 1 });
            ExperimentalAnalyzerRegistry.get.mockResolvedValue({
                id: 'bias-detection',
                processor
            });

            await ExperimentalBatchService._processItem(batch._id, item._id);

            const updatedItem = await ExperimentalBatchItem.findById(item._id);
            expect(updatedItem.status).toBe('completed');
            expect(updatedItem.answer).toBe('Generated analysis answer');
            expect(processor).toHaveBeenCalledWith(expect.objectContaining({
                question: 'How to find job in Canada?',
                answer: 'Generated analysis answer'
            }));
        });

        it('should generate a fresh answer before comparing against a baseline answer', async () => {
            const batch = await ExperimentalBatch.create({
                name: 'Baseline Comparison Analysis Batch',
                type: 'analysis',
                config: { analyzerId: 'similar-answer', workflow: 'TestGraph' }
            });
            const item = await ExperimentalBatchItem.create({
                experimentalBatch: batch._id,
                rowIndex: 1,
                question: 'When is the deadline?',
                answer: '',
                baselineAnswer: 'The deadline is June 1, 2026.'
            });

            const mockStream = {
                async *[Symbol.asyncIterator]() {
                    yield {
                        answerNode: {
                            result: {
                                answer: {
                                    content: 'The deadline is July 1, 2026.'
                                }
                            }
                        }
                    };
                }
            };
            const mockApp = { stream: vi.fn().mockResolvedValue(mockStream) };
            getGraphApp.mockResolvedValue(mockApp);

            const processor = vi.fn().mockResolvedValue({
                status: 'flagged',
                differenceFound: true,
                flagged: true
            });
            ExperimentalAnalyzerRegistry.get.mockResolvedValue({
                id: 'similar-answer',
                processor
            });

            await ExperimentalBatchService._processItem(batch._id, item._id);

            const updatedItem = await ExperimentalBatchItem.findById(item._id);
            expect(updatedItem.status).toBe('completed');
            expect(updatedItem.answer).toBe('The deadline is July 1, 2026.');
            expect(updatedItem.baselineAnswer).toBe('The deadline is June 1, 2026.');
            expect(processor).toHaveBeenCalledWith(expect.objectContaining({
                question: 'When is the deadline?',
                answer: 'The deadline is July 1, 2026.',
                baselineAnswer: 'The deadline is June 1, 2026.'
            }));
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
