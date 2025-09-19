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
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const numCPUs = os.cpus().length;


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
    async evaluateInteraction(interaction, chatId, aiProvider = null, options = {}) {
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
            if (deploymentMode === 'CDS' && vectorServiceType === 'documentdb') {
                if (!pool) {
                    const maxThreads = config.evalConcurrency || Math.max(1, numCPUs > 1 ? numCPUs - 1 : 1);
                    await ServerLoggingService.info(`Creating Piscina pool: concurrency=${maxThreads}, numCPUs=${typeof numCPUs !== 'undefined' ? numCPUs : 'unknown'}`);
                    pool = new Piscina({
                        filename: path.resolve(__dirname, 'evaluation.worker.js'),
                        minThreads: 1,
                        maxThreads: maxThreads,
                    });
                }
                return pool.run({ interactionId: interactionIdStr, chatId, aiProvider, ...options });
            } else {
                if (!directWorkerFn) {
                    const imported = await import('./evaluation.worker.js');
                    directWorkerFn = imported.default || imported;
                }
                return directWorkerFn({ interactionId: interactionIdStr, chatId, aiProvider, ...options });
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
    const vectorServiceType = await SettingsService.get('vectorServiceType') || 'imvectordb';
    const concurrency = (deploymentMode === 'CDS' && vectorServiceType === 'documentdb') ? (config.evalConcurrency || 8) : 1;
    await ServerLoggingService.info(`Evaluation concurrency: ${concurrency}, numCPUs: ${typeof numCPUs !== 'undefined' ? numCPUs : 'unknown'}`);

        try {
            await dbConnect();

            // Always skip existing evaluations
            const query = {
                question: { $exists: true, $ne: null },
                answer: { $exists: true, $ne: null },
                autoEval: { $exists: false },
                ...extraFilter
            };

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
                    // Advance lastId immediately so pagination always progresses even on early returns or errors
                    lastId = interaction._id.toString();
                    try {
                        const chats = await Chat.find({
                            interactions: interaction._id
                        });
                        const chatId = chats.length > 0 ? chats[0].chatId : null;
                        const aiProvider = (chats.length > 0 && chats[0].aiProvider) ? chats[0].aiProvider : null;
                        if (!chatId) {
                            // Count as failed so stats reflect skipped interactions and loop cannot stall
                            failedCount++;
                            ServerLoggingService.warn(`No chat found for interaction ${interaction._id}`, 'eval-service');
                            return;
                        }
                        await this.evaluateInteraction(interaction, chatId, aiProvider);
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