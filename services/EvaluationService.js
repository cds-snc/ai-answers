import mongoose from 'mongoose';
import { Interaction } from '../models/interaction.js';
import { Eval } from '../models/eval.js';
import { ExpertFeedback } from '../models/expertFeedback.js';
import ServerLoggingService from './ServerLoggingService.js';
import dbConnect from '../api/db/db-connect.js';
import config from '../config/eval.js';
import { Chat } from '../models/chat.js';

import Piscina from 'piscina';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

// Remove isActuallyOnVercel and only use deploymentMode
let pool;
let directWorkerFn;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const numCPUs = os.cpus().length;

// Always initialize both, but only use one depending on deploymentMode
pool = new Piscina({
  filename: path.resolve(__dirname, 'evaluation.worker.js'),
  minThreads: 1,
  maxThreads: Math.max(1, numCPUs > 1 ? numCPUs - 1 : 1),
});
// directWorkerFn will be loaded as needed

class EvaluationService {
    async evaluateInteraction(interaction, chatId, deploymentMode) {
        if (!interaction || !interaction._id) {
            ServerLoggingService.error('Invalid interaction object passed to evaluateInteraction', chatId, 
                { hasInteraction: !!interaction, hasId: !!interaction?._id });
            throw new Error('Invalid interaction object'); 
        }
        const interactionIdStr = interaction._id.toString();
        try {
            if (deploymentMode === 'CDS') {
                // Use Piscina worker pool for background processing
                return pool.run({ interactionId: interactionIdStr, chatId });
            } else {
                // For 'Vercel' or any other mode, run worker function directly
                if (!directWorkerFn) {
                    // Use dynamic import instead of require
                    const imported = await import('./evaluation.worker.js');
                    directWorkerFn = imported.default || imported;
                }
                return directWorkerFn({ interactionId: interactionIdStr, chatId });
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
    async processEvaluationsForDuration(duration, skipExisting = true, lastProcessedId = null, deploymentMode = 'CDS', extraFilter = {}) {
        const startTime = Date.now();
        let lastId = lastProcessedId;
        const concurrency = config.evalConcurrency || 8;

        try {
            await dbConnect();

            // If skipExisting is false and this is the first batch (no lastProcessedId),
            // delete all existing evaluations and expert feedback
            if (!skipExisting && !lastProcessedId) {
                ServerLoggingService.info('Regenerating all evaluations - deleting existing evaluations', 'system');
                // First get all evals to find the expert feedback IDs
                const allEvals = await Eval.find({});
                const expertFeedbackIds = allEvals
                    .map(evaluation => evaluation.expertFeedback)
                    .filter(id => id); // Filter out null/undefined values
                // Delete all evaluations
                await Eval.deleteMany({});
                ServerLoggingService.info(`Deleted ${allEvals.length} evaluations`, 'system');
                // Delete associated expert feedback
                if (expertFeedbackIds.length > 0) {
                    await ExpertFeedback.deleteMany({ _id: { $in: expertFeedbackIds } });
                    ServerLoggingService.info(`Deleted ${expertFeedbackIds.length} expert feedback records`, 'system');
                }
                // Clear autoEval field from all interactions
                await Interaction.updateMany(
                    { autoEval: { $exists: true } },
                    { $unset: { autoEval: "" } }
                );
                ServerLoggingService.info('Reset autoEval field in all interactions', 'system');
            }

            // Find interactions that have both question and answer
            const query = {
                question: { $exists: true, $ne: null },
                answer: { $exists: true, $ne: null },
                ...extraFilter
            };

            // If skipExisting is true, exclude interactions that already have evaluations
            if (skipExisting) {
                query.autoEval = { $exists: false };
            }

            // Add pagination using lastProcessedId if provided
            if (lastId) {
                query._id = { $gt: new mongoose.Types.ObjectId(lastId) };
            }

            // Find interactions to evaluate, sorted by _id for consistent pagination
            const interactions = await Interaction.find(query)
                .sort({ _id: 1 })
                .limit(100) // Process in batches of 100
                .populate('question answer');

            let processedCount = 0;
            let failedCount = 0;
            let idx = 0;
            while (idx < interactions.length && ((Date.now() - startTime) / 1000 < duration)) {
                const batch = interactions.slice(idx, idx + concurrency);
                const promises = batch.map(async (interaction) => {
                    try {
                        const chats = await Chat.find({ interactions: interaction._id });
                        const chatId = chats.length > 0 ? chats[0].chatId : null;
                        await this.evaluateInteraction(interaction, chatId, deploymentMode);
                        processedCount++;
                        ServerLoggingService.debug(`Successfully evaluated interaction ${interaction._id}`, 'eval-service');
                        lastId = interaction._id.toString();
                    } catch (error) {
                        failedCount++;
                        ServerLoggingService.error(
                            `Failed to evaluate interaction ${interaction._id}, continuing with next interaction`,
                            'eval-service',
                            error
                        );
                        lastId = interaction._id.toString();
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

            // Calculate and return remaining count and stats
            const remainingQuery = {
                ...query,
                _id: { $gt: new mongoose.Types.ObjectId(lastId || '000000000000000000000000') }
            };

            return {
                remaining: await Interaction.countDocuments(remainingQuery),
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