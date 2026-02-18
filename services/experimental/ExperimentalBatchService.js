import { ExperimentalBatch } from '../../models/experimentalBatch.js';
import { ExperimentalBatchItem } from '../../models/experimentalBatchItem.js';
import mongoose from 'mongoose';
import ExperimentalQueueService from './ExperimentalQueueService.js';
import ExperimentalAnalyzerRegistry from './ExperimentalAnalyzerRegistry.js';
import { AnswerGenerationService } from '../AnswerGenerationService.js';

const QUEUE_NAME = 'experimental-batch-processing';

class ExperimentalBatchService {
    constructor() {
        this._initializeProcessor();
    }

    _initializeProcessor() {
        // Register the unified processor for all experimental batch jobs
        ExperimentalQueueService.registerProcessor(QUEUE_NAME, async (job) => {
            const { batchId, itemId } = job.data;
            return await this._processItem(batchId, itemId);
        }, { concurrency: 8 });

        // Listen for events to update item status
        ExperimentalQueueService.on('completed', async ({ jobId, returnvalue }) => {
            // Optional: We can update batch summary here or in the processor
            // But _processItem already updates the item status.
            // Maybe trigger a summary update?
            if (returnvalue && returnvalue.batchId) {
                await this._updateBatchSummary(returnvalue.batchId);
            }
        });

        ExperimentalQueueService.on('failed', async ({ jobId, failedReason }) => {
            // We'd need to map jobId back to item if possible, but our architecture 
            // handles errors inside _processItem mostly.
            // If the job wrapper itself fails, we might miss an update.
        });
    }

    /**
     * Create a new experimental batch and enqueue items
     */
    async createBatch(batchData, itemsData) {
        // 1. Create Batch Record
        const batch = await ExperimentalBatch.create(batchData);

        // 2. Create Items
        const items = itemsData.map((item, index) => ({
            ...item,
            experimentalBatch: batch._id,
            rowIndex: index + 1,
            status: 'pending'
        }));

        const createdItems = await ExperimentalBatchItem.insertMany(items);

        // 3. Enqueue Jobs
        // Update status to processing
        batch.status = 'processing';
        batch.summary.total = createdItems.length;
        await batch.save();

        for (const item of createdItems) {
            await ExperimentalQueueService.enqueue(QUEUE_NAME, {
                batchId: batch._id.toString(),
                itemId: item._id.toString()
            });
        }

        return batch;
    }

    /**
     * Core processing logic called by worker
     */
    async _processItem(batchId, itemId) {
        const item = await ExperimentalBatchItem.findById(itemId);
        const batch = await ExperimentalBatch.findById(batchId);

        if (!item || !batch) throw new Error('Item or Batch not found');

        try {
            item.status = 'processing';
            await item.save();

            let result = {};

            if (batch.type === 'batch') {
                // Standard Generation
                // Construct params for AnswerGenerationService
                // We need to handle chatId generation/mocking if AnswerService requires it.
                // Assuming we treat each row as a new stateless interaction for now.
                // Note: AnswerGenerationService expects a chatId for logging/agents.
                const mockChatId = `batch-${batchId}-${itemId}`;

                result = await AnswerGenerationService.generateAnswer({
                    conversationHistory: [], // No history for batch rows usually
                    message: item.question,
                    lang: batch.config.pageLanguage,
                    provider: batch.config.aiProvider,
                    // ... map other config ...
                }, mockChatId);

                item.answer = result.content;

            } else if (batch.type === 'analysis') {
                // Analysis (Comparison or Evaluator)
                const analyzerId = batch.config.analyzerId;
                const analyzer = ExperimentalAnalyzerRegistry.get(analyzerId);

                if (!analyzer) throw new Error(`Analyzer ${analyzerId} not found`);

                const analysisResult = await analyzer.processor({
                    question: item.question,
                    baselineAnswer: item.baselineAnswer, // For comparison
                    comparisonAnswer: item.comparisonAnswer, // For comparison
                    answer: item.answer || item.question, // For single evaluator (usually operates on answer provided in input)
                    // Wait, for evaluator, the input might be mapped differently. 
                    // In the model we have `answer` field. 
                    // Let's assume input mapping put the target text in `answer` or specific fields.
                    config: batch.config.analyzerConfig
                });

                // Map output
                if (analysisResult.similarityScore !== undefined) item.similarityScore = analysisResult.similarityScore;
                if (analysisResult.match !== undefined) item.match = analysisResult.match;
                if (analysisResult.explanation) item.explanation = analysisResult.explanation;
                if (analysisResult.biasScore !== undefined || analysisResult.safetyScore !== undefined) {
                    item.evaluatorOutput = analysisResult;
                }
            }

            item.status = 'completed';
            await item.save();
            return { batchId, itemId, status: 'completed' };

        } catch (err) {
            console.error(`Batch item ${itemId} failed:`, err);
            item.status = 'failed';
            item.error = err.message;
            await item.save();
            return { batchId, itemId, status: 'failed' };
        }
    }

    /**
     * Update aggregate stats for the batch
     */
    async _updateBatchSummary(batchId) {
        const stats = await ExperimentalBatchItem.aggregate([
            { $match: { experimentalBatch: new mongoose.Types.ObjectId(batchId) } },
            {
                $group: {
                    _id: null,
                    total: { $sum: 1 },
                    completed: { $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] } },
                    failed: { $sum: { $cond: [{ $eq: ["$status", "failed"] }, 1, 0] } },
                    matches: { $sum: { $cond: [{ $eq: ["$match", true] }, 1, 0] } },
                    // Count distinct flagged or differences?
                }
            }
        ]);

        if (stats.length > 0) {
            const s = stats[0];
            await ExperimentalBatch.findByIdAndUpdate(batchId, {
                'summary.total': s.total,
                'summary.completed': s.completed,
                'summary.failed': s.failed,
                'summary.matches': s.matches,
                status: (s.completed + s.failed >= s.total) ? 'completed' : 'processing'
            });
        }
    }

    async getBatch(batchId) {
        return await ExperimentalBatch.findById(batchId);
    }

    async getBatchItems(batchId) {
        return await ExperimentalBatchItem.find({ experimentalBatch: batchId }).sort({ rowIndex: 1 });
    }
}

export default new ExperimentalBatchService();
