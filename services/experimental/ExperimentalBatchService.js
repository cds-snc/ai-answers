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
import { getPersistedAppVersion } from '../AppVersionService.js';

const QUEUE_NAME = 'experimental-batch-processing';
const BATCH_CONCURRENCY = parseInt(process.env.BATCH_CONCURRENCY, 10) || 2;
const MAX_ITEM_RETRIES = parseInt(process.env.BATCH_ITEM_MAX_RETRIES, 10) || 3;
const escapeRegex = (input = '') => input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const ANSWER_ALIASES = ['answer', 'Answer', 'Response', 'response', 'NewAnswer', 'comparison'];
// Reference answer to compare against (exact column names). `baseline` is kept
// for datasets created before the Golden* names existed.
const BASELINE_ANSWER_ALIASES = ['baselineAnswer', 'BaselineAnswer', 'baseline', 'GoldenAnswer', 'goldenAnswer'];
const WORKFLOW_ALIASES = {
    DefaultGraph: 'GenericWorkflowGraph'
};
const CHAT_ID_ALIASES = ['chatid'];
const SOURCE_CHAT_ID_ALIASES = ['chatid'];
const REFERRING_URL_ALIASES = ['referringurl', 'url'];
const QUESTION_ALIASES = ['question', 'redactedquestion', 'problemdetails', 'prompt'];

const extractAnswerText = (answer) => {
    if (typeof answer === 'string') {
        return answer.trim();
    }

    if (answer && typeof answer === 'object' && typeof answer.content === 'string') {
        return answer.content.trim();
    }

    return '';
};

const findAnswerInUpdate = (value) => {
    if (!value || typeof value !== 'object') {
        return '';
    }

    if (Array.isArray(value)) {
        for (const entry of value) {
            const found = findAnswerInUpdate(entry);
            if (found) return found;
        }
        return '';
    }

    if (Object.prototype.hasOwnProperty.call(value, 'result')) {
        const result = value.result;
        if (result && typeof result === 'object' && Object.prototype.hasOwnProperty.call(result, 'answer')) {
            const found = extractAnswerText(result.answer);
            if (found) return found;
        }
    }

    for (const entry of Object.values(value)) {
        const found = findAnswerInUpdate(entry);
        if (found) return found;
    }

    return '';
};

const pickExactField = (item = {}, keys = []) => {
    for (const key of keys) {
        const value = item[key];
        if (value !== undefined && value !== null && String(value).trim() !== '') {
            return value;
        }
    }
    return '';
};

const pickNormalizedAnswer = (item = {}) => pickExactField(item, ANSWER_ALIASES);

const normalizeFieldKey = (input = '') => String(input)
    .toLowerCase()
    .replace(/[\s_-]+/g, '')
    .trim();

const pickFirstField = (sources, keys) => {
    const normalizedKeys = keys.map(normalizeFieldKey);
    for (const source of sources) {
        if (!source || typeof source !== 'object') continue;
        for (const [key, value] of Object.entries(source)) {
            if (!normalizedKeys.includes(normalizeFieldKey(key))) {
                continue;
            }
            if (value !== undefined && value !== null && String(value).trim() !== '') {
                return value;
            }
        }
    }
    return '';
};

const resolveSourceChatId = (item) => pickFirstField([item, item?.originalData], SOURCE_CHAT_ID_ALIASES);

const createRunChatIdResolver = () => {
    const runChatIdsBySourceChatId = new Map();

    return (sourceChatId) => {
        const normalizedSourceChatId = String(sourceChatId || '').trim();
        if (!normalizedSourceChatId) {
            return crypto.randomUUID();
        }

        if (!runChatIdsBySourceChatId.has(normalizedSourceChatId)) {
            runChatIdsBySourceChatId.set(normalizedSourceChatId, crypto.randomUUID());
        }

        return runChatIdsBySourceChatId.get(normalizedSourceChatId);
    };
};

const buildConversationHistoryEntry = (turn) => ({
    sender: 'ai',
    text: turn.answer || '',
    interaction: {
        question: turn.question || '',
        answer: {
            content: turn.answer || ''
        },
        context: turn.context || null
    }
});

const makeError = (message, code, statusCode) => {
    const err = new Error(message);
    err.code = code;
    err.statusCode = statusCode;
    return err;
};

const resolveSelectedAnalyzerId = (config = {}) => {
    if (typeof config.analyzerId === 'string' && config.analyzerId.trim()) {
        return config.analyzerId.trim();
    }

    if (Array.isArray(config.analyzerIds)) {
        const ids = config.analyzerIds
            .map(id => String(id || '').trim())
            .filter(Boolean);
        if (ids.length === 1) {
            return ids[0];
        }
    }

    return '';
};

const resolveWorkflowName = (workflow = '') => {
    const trimmed = String(workflow || '').trim();
    return WORKFLOW_ALIASES[trimmed] || trimmed;
};

class ExperimentalBatchService {
    constructor() {
        this.analyzerQueues = new Map(); // analyzerId -> PQueue
        this.processorInitialized = false;
    }

    async initialize() {
        if (this.processorInitialized) return;

        const mode = process.env.REDIS_URL ? 'redis' : 'in-memory';
        console.log(`[ExperimentalBatchService] Initializing experimental batch processor (${mode} mode)`);

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

        this.processorInitialized = true;
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
        const config = batchData.config || {};

        if (batchData.type === 'analysis') {
            const selectedAnalyzerId = resolveSelectedAnalyzerId(config);
            const requestedAnalyzerIds = Array.isArray(config.analyzerIds)
                ? config.analyzerIds.map(id => String(id || '').trim()).filter(Boolean)
                : [];

            if (!selectedAnalyzerId || requestedAnalyzerIds.length > 1) {
                throw makeError('Analysis runs require exactly one analyzer', 'BAD_REQUEST', 400);
            }

            // Normalize to a single source of truth for new runs.
            batchData.config = {
                ...config,
                analyzerId: selectedAnalyzerId,
                analyzerIds: [selectedAnalyzerId]
            };

            if (batchData.config.baselineRunId) {
                if (!mongoose.Types.ObjectId.isValid(batchData.config.baselineRunId)) {
                    throw makeError('Invalid baselineRunId', 'BAD_REQUEST', 400);
                }

                const baselineBatch = await ExperimentalBatch.findById(batchData.config.baselineRunId).lean();
                if (!baselineBatch) {
                    throw makeError('Baseline run not found', 'NOT_FOUND', 404);
                }
                if (baselineBatch.type !== 'analysis') {
                    throw makeError('Baseline run must be an analysis batch', 'BAD_REQUEST', 400);
                }

                const baselineAnalyzerId = resolveSelectedAnalyzerId(baselineBatch.config || {});
                if (!baselineAnalyzerId || baselineAnalyzerId !== selectedAnalyzerId) {
                    throw makeError('Baseline analyzer must match the selected analyzer', 'BAD_REQUEST', 400);
                }
            }
        }

        // If no items provided, check if we should load from a dataset
        if (finalItems.length === 0 && batchData.config?.datasetId) {
            if (!mongoose.Types.ObjectId.isValid(batchData.config.datasetId)) {
                throw makeError('Invalid datasetId', 'BAD_REQUEST', 400);
            }

            const rows = await ExperimentalDatasetRow.find({
                experimentalDataset: new mongoose.Types.ObjectId(batchData.config.datasetId)
            }).sort({ rowIndex: 1 }).lean();

            // Check if we are comparing against a previous run
            let baselineRunItems = [];
            if (batchData.config?.baselineRunId) {
                baselineRunItems = await ExperimentalBatchItem.find({
                    experimentalBatch: new mongoose.Types.ObjectId(batchData.config.baselineRunId)
                }).sort({ rowIndex: 1 }).lean();
            }

            finalItems = rows.map((r, idx) => {
                const data = { ...r.data };
                // If comparing against previous run, set baselineAnswer to previous run's answer
                if (baselineRunItems.length > 0) {
                    const match = baselineRunItems[idx] || baselineRunItems.find(bi => bi.rowIndex === r.rowIndex);
                    if (match) {
                        data.baselineAnswer = match.answer;
                        data.baselineAnalysisResults = match.analysisResults || {};
                        data.baselineMatch = match.match;
                        data.baselineFlagged = match.flagged;
                        data.baselineChatId = match.chatId || '';

                        // Keep baseline output separate from the current answer. If the
                        // dataset row has no answer, processing will generate a fresh one.
                    }
                }
                return data;
            });
        }

        if (finalItems.length === 0) {
            throw makeError('Batch has no rows to process', 'NO_ITEMS', 400);
        }

        const batch = await ExperimentalBatch.create({
            ...batchData,
            appVersion: batchData.appVersion || getPersistedAppVersion(),
            status: 'pending',
            summary: { total: finalItems.length, completed: 0, failed: 0, matches: 0 }
        });

        const resolveRunChatId = createRunChatIdResolver();
        const items = finalItems.map((item, index) => {
            const sourceChatId = resolveSourceChatId(item);
            return {
                question: pickFirstField([item, item.originalData], QUESTION_ALIASES),
                answer: pickNormalizedAnswer(item),
                baselineAnswer: pickExactField(item, BASELINE_ANSWER_ALIASES) || '',
                baselineAnalysisResults: item.baselineAnalysisResults || {},
                baselineMatch: item.baselineMatch,
                baselineFlagged: item.baselineFlagged,
                baselineChatId: item.baselineChatId || item.originalData?.baselineChatId || '',
                referringUrl: pickFirstField([item, item.originalData], REFERRING_URL_ALIASES),
                chatId: resolveRunChatId(sourceChatId),
                originalData: item,
                experimentalBatch: batch._id,
                rowIndex: index + 1,
                status: 'pending',
                retryCount: 0
            };
        });

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

            // 1. Generation Phase
            // - Always for batch runs.
            // - For analysis runs, generate only when no answer-like input exists.
            const shouldGenerateAnswer = batch.type === 'batch'
                || (batch.type === 'analysis' && !item.answer);
            if (shouldGenerateAnswer) {
                const graphName = resolveWorkflowName(batch.config.workflow || 'DefaultGraph');
                const app = await getGraphApp(graphName);
                if (!app) throw new Error(`Graph ${graphName} not found`);

                const chatId = item.chatId || crypto.randomUUID();
                const batchUser = batch.createdBy
                    ? { userId: batch.createdBy.toString() }
                    : null;

                // Build conversationHistory from previous turns in the same chatId group
                let conversationHistory = [];
                if (item.chatId) {
                    const previousTurns = await ExperimentalBatchItem.find({
                        experimentalBatch: batchId,
                        chatId: item.chatId,
                        rowIndex: { $lt: item.rowIndex },
                        status: 'completed'
                    }).sort({ rowIndex: 1 }).lean();

                    conversationHistory = previousTurns.map(buildConversationHistoryEntry);
                }

                const input = {
                    chatId,
                    userMessage: item.question,
                    conversationHistory,
                    lang: batch.config.pageLanguage || 'en',
                    selectedAI: batch.config.aiProvider || 'azure',
                    searchProvider: batch.config.searchProvider || 'google',
                    referringUrl: item.referringUrl || batch.config.referringUrl || '',
                };

                await graphRequestContext.run({ headers: {}, user: batchUser }, async () => {
                    const stream = await app.stream(input, { streamMode: 'updates' });
                    for await (const update of stream) {
                        const answerText = findAnswerInUpdate(update);
                        if (answerText) {
                            item.answer = answerText;
                        }
                    }
                });
                item.chatId = chatId;
            }

            // 2. Analysis Phase (single analyzer)
            const analyzerId = resolveSelectedAnalyzerId(batch.config || {});
            if (analyzerId) {
                const analyzerDef = await ExperimentalAnalyzerRegistry.get(analyzerId);
                if (!analyzerDef) {
                    if (!item.analysisErrors) item.analysisErrors = {};
                    item.analysisErrors[analyzerId] = {
                        code: 'NOT_FOUND',
                        message: `Analyzer ${analyzerId} not found`
                    };
                } else {
                    try {
                        const result = await this._runAnalyzer(analyzerDef, {
                            question: item.question,
                            answer: item.answer || '',
                            baselineAnswer: item.baselineAnswer,
                            baselineAnalysisResults: item.baselineAnalysisResults,
                            baselineMatch: item.baselineMatch,
                            baselineFlagged: item.baselineFlagged,
                            config: { ...(batch.config.analyzerConfig || {}), aiProvider: batch.config.aiProvider },
                            originalData: {
                                ...(item.originalData || {}),
                                status: item.status,
                                error: item.error,
                                outcomeStatus: item.status,
                                outcomeText: item.error || item.cancellationReason || item.skipReason || item.originalData?.outcomeText || null,
                                cancellationReason: item.cancellationReason || item.originalData?.cancellationReason || null,
                                skipReason: item.skipReason || item.originalData?.skipReason || null
                            }
                        });

                        if (!item.analysisResults) item.analysisResults = {};
                        item.analysisResults[analyzerId] = result;

                        // Legacy field mapping for common fields
                        if (analyzerId === 'semantic-comparison' || analyzerId === 'expert-scorer') {
                            if (result.similarityScore !== undefined) item.similarityScore = result.similarityScore;
                            if (result.match !== undefined) item.match = result.match;
                            if (result.explanation) item.explanation = result.explanation;
                            if (result.verdict) {
                                item.match = result.verdict === 'pass';
                                item.explanation = result.explanation;
                            }
                        }

                        // Propagate flags/diffs to item level for unified counts/UI
                        if (result.flagged === true) item.flagged = true;
                        if (result.differenceFound === true) item.flagged = true;
                        if (result.label === 'biased' || result.label === 'caution') item.flagged = true;
                        if (result.status === 'flagged' || result.verdict === 'fail') item.flagged = true;
                    } catch (err) {
                        if (!item.analysisErrors) item.analysisErrors = {};
                        item.analysisErrors[analyzerId] = {
                            code: 'ANALYSIS_FAILED',
                            message: err.message
                        };
                    }
                }

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
                    flagged: { $sum: { $cond: [{ $eq: ["$flagged", true] }, 1, 0] } },
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
                'summary.flagged': s.flagged || 0,
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

            await ExperimentalDataset.updateOne(
                { _id: dataset._id },
                { rowCount: rows.length }
            );
            dataset.rowCount = rows.length;

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
