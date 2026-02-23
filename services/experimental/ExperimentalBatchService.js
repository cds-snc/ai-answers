import { ExperimentalBatch } from '../../models/experimentalBatch.js';
import { ExperimentalBatchItem } from '../../models/experimentalBatchItem.js';
import { ExperimentalDataset } from '../../models/experimentalDataset.js';
import { ExperimentalDatasetRow } from '../../models/experimentalDatasetRow.js';
import mongoose from 'mongoose';
import ExperimentalQueueService from './ExperimentalQueueService.js';
import ExperimentalAnalyzerRegistry from './ExperimentalAnalyzerRegistry.js';
import { getGraphApp } from '../../agents/graphs/registry.js';
import { graphRequestContext } from '../../agents/graphs/requestContext.js';
import crypto from 'crypto';
import PQueue from 'p-queue';

const QUEUE_NAME = 'experimental-batch-processing';
const BATCH_CONCURRENCY = parseInt(process.env.BATCH_CONCURRENCY, 10) || 2;
const MAX_ITEM_RETRIES = parseInt(process.env.BATCH_ITEM_MAX_RETRIES, 10) || 3;
const escapeRegex = (input = '') => input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const makeError = (message, code, statusCode) => {
    const err = new Error(message);
    err.code = code;
    err.statusCode = statusCode;
    return err;
};

class ExperimentalBatchService {
    constructor() {
        this.analyzerQueues = new Map(); // analyzerId -> PQueue
        this._initializeProcessor();
    }

    _initializeProcessor() {
        ExperimentalQueueService.registerProcessor(QUEUE_NAME, async (job) => {
            const { batchId, itemId } = job.data;
            return await this._processItem(batchId, itemId);
        }, { concurrency: BATCH_CONCURRENCY });

        ExperimentalQueueService.on('completed', async ({ queueName, returnvalue }) => {
            if (queueName === QUEUE_NAME && returnvalue && returnvalue.batchId) {
                console.log(`[ExperimentalBatchService] Received 'completed' event from queue for batch ${returnvalue.batchId}`);
                await this._updateBatchSummary(returnvalue.batchId);
            }
        });
    }

    _getAnalyzerQueue(analyzerId, concurrency) {
        if (!this.analyzerQueues.has(analyzerId)) {
            this.analyzerQueues.set(analyzerId, new PQueue({
                concurrency: concurrency || (parseInt(process.env.EVAL_CONCURRENCY, 10) || 5)
            }));
        }
        return this.analyzerQueues.get(analyzerId);
    }

    async createBatch(batchData, itemsData) {
        let finalItems = Array.isArray(itemsData) ? itemsData : [];

        // If no items provided, check if we should load from a dataset
        if (finalItems.length === 0 && batchData.config?.datasetId) {
            if (!mongoose.Types.ObjectId.isValid(batchData.config.datasetId)) {
                throw makeError('Invalid datasetId', 'BAD_REQUEST', 400);
            }

            const rows = await ExperimentalDatasetRow.find({
                experimentalDataset: new mongoose.Types.ObjectId(batchData.config.datasetId)
            }).sort({ rowIndex: 1 }).lean();

            finalItems = rows.map(r => r.data);
        }

        if (finalItems.length === 0) {
            throw makeError('Batch has no rows to process', 'NO_ITEMS', 400);
        }

        const batch = await ExperimentalBatch.create({
            ...batchData,
            status: 'pending',
            summary: { total: finalItems.length, completed: 0, failed: 0, matches: 0 }
        });

        const items = finalItems.map((item, index) => ({
            question: item.question || item.Question || item.REDACTEDQUESTION || item.Prompt || '',
            answer: item.answer || item.Answer || item.Response || '',
            baselineAnswer: item.baselineAnswer || item.baseline || item.GoldenAnswer || '',
            comparisonAnswer: item.comparisonAnswer || item.comparison || item.NewAnswer || '',
            referringUrl: item.referringUrl || item.ReferringUrl || item.referringurl || '',
            chatId: item.chatId || item.ChatId || item.chatid || '',
            originalData: item,
            experimentalBatch: batch._id,
            rowIndex: index + 1,
            status: 'pending',
            retryCount: 0
        }));

        await ExperimentalBatchItem.insertMany(items);

        return batch;
    }

    async cancelBatch(batchId) {
        const batch = await ExperimentalBatch.findById(batchId);
        if (!batch) throw makeError('Batch not found', 'NOT_FOUND', 404);
        if (['completed', 'failed', 'cancelled'].includes(batch.status)) {
            throw makeError(`Cannot cancel batch in status "${batch.status}"`, 'INVALID_STATE', 409);
        }

        batch.status = 'cancelled';
        await batch.save();

        // Mark all pending items as cancelled
        await ExperimentalBatchItem.updateMany(
            { experimentalBatch: batchId, status: 'pending' },
            { status: 'cancelled', cancellationReason: 'Batch cancelled by user' }
        );

        await this._updateBatchSummary(batchId);
        return batch;
    }

    async _processItem(batchId, itemId) {
        const batch = await ExperimentalBatch.findById(batchId);

        if (!batch) throw makeError('Batch not found', 'NOT_FOUND', 404);

        if (batch.status === 'cancelled') {
            await ExperimentalBatchItem.updateOne(
                { _id: itemId, experimentalBatch: batchId, status: 'pending' },
                { $set: { status: 'cancelled', cancellationReason: 'Batch was cancelled' } }
            );
            return { batchId, itemId, status: 'cancelled' };
        }

        const item = await ExperimentalBatchItem.findOneAndUpdate(
            { _id: itemId, experimentalBatch: batchId, status: 'pending' },
            {
                $set: { status: 'processing', lastAttemptAt: new Date() },
                $inc: { retryCount: 1 }
            },
            { new: true }
        );

        // Another worker/process already handled this item or it is not in a processable state.
        if (!item) {
            const existingItem = await ExperimentalBatchItem.findById(itemId).select('status');
            return { batchId, itemId, status: existingItem?.status || 'missing' };
        }

        try {
            if (item.retryCount > MAX_ITEM_RETRIES) {
                throw makeError(`Retry limit reached (${MAX_ITEM_RETRIES})`, 'RETRY_LIMIT', 409);
            }

            // 1. Generation Phase (if type is batch)
            if (batch.type === 'batch') {
                const graphName = batch.config.workflow || 'GenericWorkflowGraph';
                const app = await getGraphApp(graphName);
                if (!app) throw new Error(`Graph ${graphName} not found`);

                const chatId = item.chatId || crypto.randomUUID();

                // Build conversationHistory from previous turns in the same chatId group
                let conversationHistory = [];
                if (item.chatId) {
                    const previousTurns = await ExperimentalBatchItem.find({
                        experimentalBatch: batchId,
                        chatId: item.chatId,
                        rowIndex: { $lt: item.rowIndex },
                        status: 'completed'
                    }).sort({ rowIndex: 1 }).lean();

                    conversationHistory = previousTurns.flatMap(t => [
                        { role: 'user', content: t.question },
                        { role: 'assistant', content: t.answer }
                    ]);
                }

                const input = {
                    chatId,
                    message: item.question,
                    conversationHistory,
                    pageLanguage: batch.config.pageLanguage || 'en',
                    aiProvider: batch.config.aiProvider || 'azure',
                    referringUrl: item.referringUrl || batch.config.referringUrl || '',
                    skipPersist: true,
                };

                await graphRequestContext.run({ headers: {}, user: null }, async () => {
                    const stream = await app.stream(input, { streamMode: 'updates' });
                    for await (const update of stream) {
                        if (update.result?.answer) {
                            item.answer = typeof update.result.answer === 'string'
                                ? update.result.answer
                                : update.result.answer.content;
                        }
                    }
                });
                item.chatId = chatId;
            }

            // 2. Analysis Phase (multi-analyzer)
            const analyzerConfigs = Array.isArray(batch.config?.analyzers)
                ? [...batch.config.analyzers]
                : [];

            // Handle analyzerIds array (strings)
            if (Array.isArray(batch.config?.analyzerIds)) {
                for (const id of batch.config.analyzerIds) {
                    if (!analyzerConfigs.some(a => a.id === id)) {
                        analyzerConfigs.push({ id, config: batch.config.analyzerConfig || {} });
                    }
                }
            }

            // Backward compatibility for single analyzerId
            if (batch.config.analyzerId && !analyzerConfigs.some(a => a.id === batch.config.analyzerId)) {
                analyzerConfigs.push({ id: batch.config.analyzerId, config: batch.config.analyzerConfig || {} });
            }

            // Resolve answer before analysis: if item has no answer, fall back to question.
            // This ensures the export always shows the text that was actually analyzed.
            if (!item.answer) item.answer = item.question;

            if (analyzerConfigs.length > 0) {
                const analysisPromises = analyzerConfigs.map(async (aConfig) => {
                    const analyzerDef = await ExperimentalAnalyzerRegistry.get(aConfig.id);
                    if (!analyzerDef) {
                        return { id: aConfig.id, error: { code: 'NOT_FOUND', message: `Analyzer ${aConfig.id} not found` } };
                    }

                    try {
                        const result = await this._runAnalyzer(analyzerDef, {
                            question: item.question,
                            answer: item.answer || item.question,
                            baselineAnswer: item.baselineAnswer,
                            comparisonAnswer: item.comparisonAnswer,
                            config: { ...aConfig.config, aiProvider: batch.config.aiProvider },
                            originalData: item.originalData
                        });
                        return { id: aConfig.id, result };
                    } catch (err) {
                        return { id: aConfig.id, error: { code: 'ANALYSIS_FAILED', message: err.message } };
                    }
                });

                const results = await Promise.all(analysisPromises);

                results.forEach(res => {
                    if (res.result) {
                        if (!item.analysisResults) item.analysisResults = {};
                        item.analysisResults[res.id] = res.result;

                        // Legacy field mapping for common fields
                        if (res.id === 'semantic-comparison' || res.id === 'expert-scorer') {
                            if (res.result.similarityScore !== undefined) item.similarityScore = res.result.similarityScore;
                            if (res.result.match !== undefined) item.match = res.result.match;
                            if (res.result.explanation) item.explanation = res.result.explanation;
                            if (res.result.verdict) {
                                item.match = res.result.verdict === 'pass';
                                item.explanation = res.result.explanation;
                            }
                        }
                    } else if (res.error) {
                        if (!item.analysisErrors) item.analysisErrors = {};
                        item.analysisErrors[res.id] = res.error;
                    }
                });

                if (item.analysisResults) item.markModified('analysisResults');
                if (item.analysisErrors) item.markModified('analysisErrors');
            }

            item.status = 'completed';
            await item.save();
        } catch (err) {
            console.error(`Batch item ${itemId} failed:`, err);
            item.status = 'failed';
            item.error = err.message;
            await item.save();
        } finally {
            // Enqueue next turn in the same chatId group if it exists
            if (item.chatId) {
                try {
                    const nextItem = await ExperimentalBatchItem.findOne({
                        experimentalBatch: batchId,
                        chatId: item.chatId,
                        rowIndex: { $gt: item.rowIndex },
                        status: 'pending'
                    }).sort({ rowIndex: 1 });

                    if (nextItem) {
                        await ExperimentalQueueService.enqueue(QUEUE_NAME, {
                            batchId: batchId.toString(),
                            itemId: nextItem._id.toString()
                        });
                    }
                } catch (enqueueErr) {
                    console.error('Failed to enqueue next turn:', enqueueErr);
                }
            }
        }
        return { batchId, itemId, status: item.status };
    }

    async _runAnalyzer(analyzerDef, input) {
        const maxAttempts = 3;
        const timeoutMs = 60000;

        const q = this._getAnalyzerQueue(analyzerDef.id, analyzerDef.concurrency);

        return q.add(async () => {
            for (let attempt = 1; attempt <= maxAttempts; attempt++) {
                try {
                    return await Promise.race([
                        analyzerDef.processor(input),
                        new Promise((_, reject) => {
                            setTimeout(() => reject(new Error(`Analyzer timeout after ${timeoutMs}ms`)), timeoutMs);
                        }),
                    ]);
                } catch (err) {
                    if (attempt === maxAttempts) throw err;
                    // Exponential backoff: 1s, 2s, 4s
                    await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt - 1) * 1000));
                }
            }
        });
    }

    async _updateBatchSummary(batchId) {
        console.log(`[ExperimentalBatchService] Updating summary for batch ${batchId}...`);
        const stats = await ExperimentalBatchItem.aggregate([
            { $match: { experimentalBatch: new mongoose.Types.ObjectId(batchId) } },
            {
                $group: {
                    _id: null,
                    total: { $sum: 1 },
                    pending: { $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] } },
                    processing: { $sum: { $cond: [{ $eq: ["$status", "processing"] }, 1, 0] } },
                    completed: { $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] } },
                    failed: {
                        $sum: {
                            $cond: [{
                                $or: [
                                    { $eq: ["$status", "failed"] },
                                    { $eq: ["$status", "refused"] }
                                ]
                            }, 1, 0]
                        }
                    },
                    cancelled: { $sum: { $cond: [{ $eq: ["$status", "cancelled"] }, 1, 0] } },
                    matches: { $sum: { $cond: [{ $eq: ["$match", true] }, 1, 0] } },
                }
            }
        ]).allowDiskUse(true);

        if (stats.length > 0) {
            const s = stats[0];
            const batch = await ExperimentalBatch.findById(batchId);

            // Per-analyzer summary
            const items = await ExperimentalBatchItem.find({ experimentalBatch: batchId });
            const analyzerSummary = {};

            items.forEach(item => {
                const analyzers = Object.keys(item.analysisResults || {}).concat(Object.keys(item.analysisErrors || {}));
                const uniqueAnalyzers = [...new Set(analyzers)];

                uniqueAnalyzers.forEach(aId => {
                    if (!analyzerSummary[aId]) analyzerSummary[aId] = { completed: 0, failed: 0, skipped: 0 };
                    if (item.analysisResults?.[aId]) analyzerSummary[aId].completed++;
                    else if (item.analysisErrors?.[aId]) analyzerSummary[aId].failed++;
                    else if (item.status === 'skipped' || item.status === 'cancelled') analyzerSummary[aId].skipped++;
                });
            });

            let nextStatus = 'processing';
            const hasInFlight = (s.pending + s.processing) > 0;
            if (batch.status === 'cancelled') {
                nextStatus = 'cancelled';
            } else if (!hasInFlight) {
                nextStatus = 'completed';
            }

            await ExperimentalBatch.findByIdAndUpdate(batchId, {
                'summary.total': s.total,
                'summary.completed': s.completed,
                'summary.failed': s.failed,
                'summary.matches': s.matches,
                'analyzerSummary': analyzerSummary,
                status: nextStatus
            });
        }
    }

    async promoteToDataset(batchId, details) {
        let dataset;
        try {
            const batch = await ExperimentalBatch.findById(batchId);
            if (!batch) throw makeError('Batch not found', 'NOT_FOUND', 404);
            if (!['completed', 'failed', 'cancelled'].includes(batch.status)) {
                throw makeError('Cannot promote batch while it is still running', 'INVALID_STATE', 409);
            }

            const existing = await ExperimentalDataset.findOne({
                name: { $regex: `^${escapeRegex(details.name)}$`, $options: 'i' }
            });
            if (existing) {
                throw makeError(`Dataset "${details.name}" already exists`, 'DUPLICATE', 409);
            }

            dataset = new ExperimentalDataset({
                name: details.name,
                description: details.description || `Promoted from batch: ${batch.name}`,
                type: 'batch-output',
                sourceType: 'promoted-from-batch',
                sourceBatchId: batchId,
                createdBy: details.userId,
            });
            await dataset.save();

            const items = await ExperimentalBatchItem.find({
                experimentalBatch: batchId
            }).sort({ rowIndex: 1 });

            const rows = items.map((item, idx) => ({
                experimentalDataset: dataset._id,
                rowIndex: idx + 1,
                data: {
                    sourceRowIndex: item.rowIndex,
                    outcomeStatus: item.status,
                    outcomeCode: item.outcomeCode || null,
                    outcomeText: item.outcomeText || item.error || item.cancellationReason || item.skipReason || null,
                    isProcessable: item.status === 'completed',
                    question: item.question,
                    answer: item.answer || null,
                    ...(item.similarityScore !== undefined && { similarityScore: item.similarityScore }),
                    ...(item.evaluatorOutput && { evaluatorOutput: item.evaluatorOutput }),
                    ...(item.analysisResults && { analysisResults: item.analysisResults }),
                    ...(item.referringUrl && { referringUrl: item.referringUrl }),
                    ...(item.chatId && { chatId: item.chatId }),
                }
            }));

            await ExperimentalDatasetRow.insertMany(rows);

            dataset.rowCount = rows.length;
            await dataset.save();

            return {
                dataset,
                warning: {
                    code: rows.some(r => r.data.outcomeStatus !== 'completed') ? 'NON_COMPLETED_ROWS_INCLUDED' : null
                }
            };
        } catch (err) {
            // Cleanup on failure
            if (dataset) {
                await ExperimentalDataset.findByIdAndDelete(dataset._id);
                await ExperimentalDatasetRow.deleteMany({ experimentalDataset: dataset._id });
            }
            throw err;
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
