import mongoose from 'mongoose';
import { Interaction } from '../models/interaction.js';
import { Eval } from '../models/eval.js';
import { ExpertFeedback } from '../models/expertFeedback.js';
import ServerLoggingService from './ServerLoggingService.js';
import dbConnect from '../api/db/db-connect.js';
import config from '../config/eval.js';
import { Chat } from '../models/chat.js';
import { SettingsService } from './SettingsService.js';
import Piscina from 'piscina';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';


let pool;
let directWorkerFn;
let _poolInitPromise = null;
let _poolCreated = false;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const numCPUs = os.cpus().length;

// Helper to compute the effective concurrency to use for both the worker pool
// and the batch processing loop. This uses the configured value in
// `config.evalConcurrency` as the authoritative source (per request). We still
// log `numCPUs` so operators can see the host's capacity.
function getEffectiveConcurrency() {
    const cfg = Number.isFinite(Number(config.evalConcurrency)) ? Number(config.evalConcurrency) : null;
    if (cfg && cfg > 0) return Math.max(1, Math.floor(cfg));
    // Fallback: use numCPUs-1 or 1
    return Math.max(1, numCPUs > 1 ? numCPUs - 1 : 1);
}

function extractStageTimeline(outcome) {
    if (!outcome) return [];
    const timelineSource = (() => {
        if (Array.isArray(outcome.stageTimeline)) return outcome.stageTimeline;
        if (outcome.stageTimeline && typeof outcome.stageTimeline === 'object' && typeof outcome.stageTimeline.toObject === 'function') {
            return outcome.stageTimeline.toObject();
        }
        if (typeof outcome.toObject === 'function') {
            const obj = outcome.toObject();
            if (Array.isArray(obj?.stageTimeline)) return obj.stageTimeline;
        }
        return [];
    })();
    if (!Array.isArray(timelineSource)) return [];
    return timelineSource.map((entry) => {
        if (!entry) return null;
        if (typeof entry.toObject === 'function') {
            return entry.toObject();
        }
        return entry;
    }).filter(Boolean);
}

function logEvaluationStages(chatId, interactionId, outcome) {
    const timeline = extractStageTimeline(outcome);
    if (!timeline.length) return;
    const finalEvent = timeline[timeline.length - 1] || {};
    const failures = timeline.filter((event) => event?.status === 'failure');
    ServerLoggingService.info('Evaluation stage timeline', chatId, {
        interactionId,
        finalStage: finalEvent.stage || '',
        finalStatus: finalEvent.status || '',
        failureCodes: failures.map((event) => event?.code).filter(Boolean),
        stageTimeline: timeline
    });
}


class EvaluationService {
    /**
     * Delete all expert feedback for a given chatId
     * @param {string} chatId
     * @returns {Promise<{message: string, deletedCount: number}|{error: string, status?: number}>}
     */
    async deleteExpertFeedbackForChat(chatId) {
        try {
            await dbConnect();
            if (!chatId) {
                return { error: 'chatId is required', status: 400 };
            }
            const chat = await Chat.findOne({ chatId }).populate('interactions');
            if (!chat) {
                return { error: 'Chat not found', status: 404 };
            }
            const interactionIds = chat.interactions.map(i => i._id);
            if (!interactionIds.length) {
                return { message: `No interactions found for chat ${chatId}`, deletedCount: 0 };
            }
            const interactions = await Interaction.find({ _id: { $in: interactionIds } });
            const expertFeedbackIds = interactions.map(i => i.expertFeedback).filter(Boolean);
            await Interaction.updateMany(
                { _id: { $in: interactionIds } },
                { $unset: { expertFeedback: "" } }
            );
            let deletedCount = 0;
            if (expertFeedbackIds.length) {
                const result = await ExpertFeedback.deleteMany({ _id: { $in: expertFeedbackIds } });
                deletedCount = result.deletedCount || 0;
            }
            return {
                message: `Deleted ${deletedCount} expert feedback(s) for chat ${chatId}`,
                deletedCount
            };
        } catch (error) {
            console.error(error);
            return { error: 'Failed to delete expert feedback', status: 500 };
        }
    }
    /**
     * Delete evaluations (and associated expert feedback) for interactions in a date range or all.
     * @param {Object} options - { timeFilter }
     * @returns {Object} - { deleted, expertFeedbackDeleted }
     */
    async deleteEvaluations({ timeFilter, onlyEmpty = false }) {
        await dbConnect();
        let evalQuery = {};

        if (timeFilter && Object.keys(timeFilter).length > 0) {
            // Find interactions in the date range
            let interactionQuery = { ...timeFilter, autoEval: { $exists: true } };
            const interactions = await Interaction.find(interactionQuery).select('autoEval');
            const evalIdsToDelete = interactions.map(i => i.autoEval).filter(Boolean);
            evalQuery = { _id: { $in: evalIdsToDelete } };
        } else {
            // No time filter: operate on all evals
            evalQuery = {}; // All evals
        }

        if (onlyEmpty) {
            // Only delete empty evals: processed, hasMatches: false, noMatchReasonType present, and no expertFeedback
            evalQuery = {
                ...evalQuery,
                processed: true,
                hasMatches: false,
                noMatchReasonType: { $exists: true, $ne: null, $ne: '' },
                expertFeedback: { $exists: false }
            };
        }

        const evalsToDelete = await Eval.find(evalQuery).select('_id expertFeedback');
        const evalIds = evalsToDelete.map(e => e._id);
        let expertFeedbackDeleted = 0;

        if (evalIds.length > 0) {
            // Remove autoEval from interactions if timeFilter was used
            if (timeFilter && Object.keys(timeFilter).length > 0) {
                await Interaction.updateMany({ autoEval: { $in: evalIds } }, { $unset: { autoEval: "" } });
            }
            // Delete evals
            await Eval.deleteMany({ _id: { $in: evalIds } });
            // Delete associated expert feedback
            const expertFeedbackIds = evalsToDelete.map(e => e.expertFeedback).filter(Boolean);
            if (expertFeedbackIds.length > 0) {
                const deletedExpertFeedback = await ExpertFeedback.deleteMany({ _id: { $in: expertFeedbackIds } });
                expertFeedbackDeleted = deletedExpertFeedback.deletedCount || 0;
            }
            return { deleted: evalIds.length, expertFeedbackDeleted };
        }
        return { deleted: 0, expertFeedbackDeleted: 0 };
    }
    async evaluateInteraction(interaction, chatId, options = {}) {
        if (!interaction || !interaction._id) {
            ServerLoggingService.error('Invalid interaction object passed to evaluateInteraction', chatId,
                { hasInteraction: !!interaction, hasId: !!interaction?._id });
            throw new Error('Invalid interaction object');
        }
        const interactionIdStr = interaction._id.toString();
        try {
            // Fetch deploymentMode and vectorServiceType from SettingsService
            const deploymentMode = await SettingsService.get('deploymentMode') || 'CDS';
            const vectorServiceType = await SettingsService.get('vectorServiceType') || 'imvectordb';
            // Resolve the ai provider from SettingsService (single source of truth)
            let providerSetting = null;
            try {
                providerSetting = await SettingsService.get('provider');
            } catch (e) {
                providerSetting = null;
            }
            const aiProviderToUse = providerSetting || 'openai';
            if (deploymentMode === 'CDS') {
                // Ensure only one concurrent initialization creates the Piscina pool
                if (!pool) {
                    if (!_poolInitPromise) {
                        _poolInitPromise = (async () => {
                            try {
                                const maxThreads = getEffectiveConcurrency();
                                await ServerLoggingService.info(`Creating Piscina pool: maxThreads=${maxThreads}, numCPUs=${typeof numCPUs !== 'undefined' ? numCPUs : 'unknown'}`, null, { configEvalConcurrency: config.evalConcurrency });
                                // Best-effort diagnostic: include PID and creation stack so we can detect
                                // unexpected multiple initializations or multiple processes.
                                // Log at debug level and use an explicit `creationStack` key so this
                                // diagnostic doesn't look like a thrown exception in higher-severity logs.
                                // Log a simple debug message when creating the pool.
                                // Avoid capturing or logging an error stack here so startup
                                // doesn't emit a stack trace in logs—operators only need
                                // to know the pool is being created.
                                try {
                                    await ServerLoggingService.debug(
                                        'Creating Piscina pool (no stack trace)',
                                        null,
                                        { pid: process.pid }
                                    );
                                } catch (e) {
                                    // ignore logging errors
                                }
                                pool = new Piscina({
                                    filename: path.resolve(__dirname, 'evaluation.worker.js'),
                                    minThreads: 1,
                                    maxThreads: maxThreads,
                                    idleTimeout: Infinity // Keep workers alive indefinitely
                                });
                                _poolCreated = true;
                                return pool;
                            } catch (err) {
                                // Reset the init promise so future attempts can retry
                                _poolInitPromise = null;
                                throw err;
                            }
                        })();
                    }
                    // Wait for the single init to complete (other callers will await the same promise)
                    await _poolInitPromise;
                } else {
                    // Pool already exists in this process - log at debug level for diagnostics
                    ServerLoggingService.debug('Piscina pool already initialized, reusing existing pool', null, { pid: process.pid });
                }
                // Only pass simple, serializable fields to the worker. Don't spread `options`
                // directly because it can contain non-cloneable values (functions, mongoose
                // documents, etc.) which will cause a DataCloneError inside Piscina.
                const workerPayload = {
                    interactionId: interactionIdStr,
                    chatId,
                    aiProvider: aiProviderToUse,
                    // Only include the explicit flags the worker expects.
                    forceFallbackEval: !!(options && options.forceFallbackEval)
                };
                const result = await pool.run(workerPayload);
                // If worker returned an evaluation document or object containing stageTimeline, log it
                try {
                    logEvaluationStages(chatId, interactionIdStr, result);
                } catch (e) {
                    ServerLoggingService.warn('Failed to extract stage timeline from worker result', chatId, e);
                }
                return result;
            } else {
                if (!directWorkerFn) {
                    const imported = await import('./evaluation.worker.js');
                    directWorkerFn = imported.default || imported;
                }
                // For the direct (non-worker) path we also pass only the expected
                // serializable fields. This keeps behavior consistent between paths.
                const directPayload = {
                    interactionId: interactionIdStr,
                    chatId,
                    aiProvider: aiProviderToUse,
                    forceFallbackEval: !!(options && options.forceFallbackEval)
                };
                const res = await directWorkerFn(directPayload);
                try {
                    logEvaluationStages(chatId, interactionIdStr, res);
                } catch (e) {
                    ServerLoggingService.warn('Failed to extract stage timeline from direct worker result', chatId, e);
                }
                return res;
            }
        } catch (error) {
            ServerLoggingService.error('Error during interaction evaluation dispatch', chatId, {
                interactionId: interactionIdStr,
                errorMessage: error.message
            });
            throw error;
        }
    }

    // Check if an interaction already has an evaluation
    async hasExistingEvaluation(interactionId) {
        await dbConnect();
        try {
            const interaction = await Interaction.findById(interactionId).populate('autoEval');
            ServerLoggingService.debug(`Checked for existing evaluation`, interactionId.toString(), {
                exists: !!interaction?.autoEval
            });
            return !!interaction?.autoEval;
        } catch (error) {
            ServerLoggingService.error('Error checking for existing evaluation', interactionId.toString(), error);
            return false;
        }
    }

    // Get evaluation for a specific interaction
    async getEvaluationForInteraction(interactionId) {
        await dbConnect();
        try {
            const interaction = await Interaction.findById(interactionId).populate('autoEval');
            const evaluation = interaction?.autoEval;

            if (evaluation) {
                ServerLoggingService.debug('Retrieved evaluation', interactionId.toString(), {
                    evaluationId: evaluation._id
                });
            } else {
                ServerLoggingService.debug('No evaluation found', interactionId.toString());
            }

            return evaluation;
        } catch (error) {
            ServerLoggingService.error('Error retrieving evaluation', interactionId.toString(), error);
            return null;
        }
    }

    /**
     * Process interactions for evaluation for a specified duration.
     * This method will now call the worker-offloaded `evaluateInteraction`.
     */
    async processEvaluationsForDuration(duration, lastProcessedId = null, extraFilter = {}) {
        const startTime = Date.now();
        let lastId = lastProcessedId;
        // Fetch deploymentMode and vectorServiceType from SettingsService
        const deploymentMode = await SettingsService.get('deploymentMode') || 'CDS';
       

        // Resolve global ai provider from settings once (single source of truth)
        let globalProvider = 'openai';
        try {
            const p = await SettingsService.get('provider');
            if (p) globalProvider = p;
        } catch (e) {
            globalProvider = 'openai';
        }

        // Compute the batch concurrency from the configured concurrency so the
        // same value is used for slicing batches and for the worker pool.
        const concurrency = (deploymentMode === 'CDS') ? getEffectiveConcurrency() : 1;
        await ServerLoggingService.info(`Evaluation concurrency (batch): ${concurrency}, numCPUs: ${typeof numCPUs !== 'undefined' ? numCPUs : 'unknown'}`);

        try {
            await dbConnect();

            // Always skip existing evaluations
            const query = {
                question: { $exists: true, $ne: null },
                answer: { $exists: true, $ne: null },
                // autoEval may be present with value `null` due to schema defaults.
                // Match both missing and explicit null values by using `null`.
                autoEval: null,
                ...extraFilter
            };

            // Add pagination using lastProcessedId if provided
            if (lastId) {
                query._id = { $gt: new mongoose.Types.ObjectId(lastId) };
            }

            // Use an aggregation to find interactions that either have no autoEval
            // (missing or explicit null) OR have an autoEval that references a
            // non-existent Eval document (orphan). This avoids a second pass to
            // discover orphaned refs and returns plain JS objects (which is fine
            // because evaluateInteraction only needs the interaction id).
            const matchBase = {
                question: { $exists: true, $ne: null },
                answer: { $exists: true, $ne: null },
                ...extraFilter
            };

            if (lastId) {
                matchBase._id = { $gt: new mongoose.Types.ObjectId(lastId) };
            }

            const pipeline = [
                { $match: matchBase },
                {
                    $lookup: {
                        from: Eval.collection.name,
                        localField: 'autoEval',
                        foreignField: '_id',
                        as: 'evalDoc'
                    }
                },
                {
                    $match: {
                        $or: [
                            { autoEval: null },
                            {
                                $and: [
                                    { autoEval: { $exists: true, $ne: null } },
                                    { $expr: { $eq: [ { $size: '$evalDoc' }, 0 ] } }
                                ]
                            }
                        ]
                    }
                },
                { $sort: { _id: 1 } },
                { $limit: 100 }
            ];

            const interactions = await Interaction.aggregate(pipeline).exec();
            ServerLoggingService.debug(`Aggregation fetched ${interactions.length} interactions for evaluation`, 'eval-service');

            let processedCount = 0;
            let failedCount = 0;
            let idx = 0;
            while (idx < interactions.length && ((Date.now() - startTime) / 1000 < duration)) {
                const batch = interactions.slice(idx, idx + concurrency);
                const promises = batch.map(async (interaction) => {
                    // Advance lastId immediately so pagination always progresses even on early returns or errors
                    lastId = interaction._id.toString();
                    try {
                        const chats = await Chat.find({
                            interactions: interaction._id
                        });
                        const chatId = chats.length > 0 ? chats[0].chatId : null;
                        // Provider is resolved centrally inside evaluateInteraction (do not use per-chat provider)
                        if (!chatId) {
                            // Count as failed so stats reflect skipped interactions and loop cannot stall
                            failedCount++;
                            ServerLoggingService.warn(`No chat found for interaction ${interaction._id}`, 'eval-service');
                            return;
                        }
                        await this.evaluateInteraction(interaction, chatId);
                        processedCount++;
                        ServerLoggingService.debug(`Successfully evaluated interaction ${interaction._id}`, 'eval-service');
                    } catch (error) {
                        failedCount++;
                        ServerLoggingService.error(
                            `Failed to evaluate interaction ${interaction._id}, continuing with next interaction`,
                            'eval-service',
                            error
                        );
                    }
                });
                await Promise.allSettled(promises);
                idx += concurrency;
                if ((Date.now() - startTime) / 1000 >= duration) {
                    break;
                }
            }

            ServerLoggingService.info(
                `Evaluation batch completed: ${processedCount} successful, ${failedCount} failed`,
                'eval-service'
            );

            // Calculate and return remaining count and stats.
            // Use the same aggregation logic (including orphaned autoEval refs)
            // so `remaining` matches what was actually considered by the run.
            const remainingMatch = {
                ...matchBase,
                _id: { $gt: new mongoose.Types.ObjectId(lastId || '000000000000000000000000') }
            };

            const remainingCountPipeline = [
                { $match: remainingMatch },
                {
                    $lookup: {
                        from: Eval.collection.name,
                        localField: 'autoEval',
                        foreignField: '_id',
                        as: 'evalDoc'
                    }
                },
                {
                    $match: {
                        $or: [
                            { autoEval: null },
                            {
                                $and: [
                                    { autoEval: { $exists: true, $ne: null } },
                                    { $expr: { $eq: [ { $size: '$evalDoc' }, 0 ] } }
                                ]
                            }
                        ]
                    }
                },
                { $count: 'count' }
            ];

            const remainingAgg = await Interaction.aggregate(remainingCountPipeline).exec();
            const remaining = (remainingAgg[0] && remainingAgg[0].count) || 0;

            return {
                remaining,
                lastProcessedId: lastId,
                processed: processedCount,
                failed: failedCount,
                duration: Math.round((Date.now() - startTime) / 1000)
            };
        } catch (error) {
            ServerLoggingService.error('Error processing evaluations for duration', 'system', error);
            throw error;
        }
    }

}

export default new EvaluationService();