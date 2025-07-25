import dbConnect from './db-connect.js';
import { Interaction } from '../../models/interaction.js';
import { Eval } from '../../models/eval.js';
import EvaluationService from '../../services/EvaluationService.js';
import config from '../../config/eval.js';
import { Setting } from '../../models/setting.js';


export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { lastProcessedId, regenerateAll, startTime, endTime, skipEmptyCleanup } = req.body;
        const duration = config.evalBatchProcessingDuration; // Use config value for duration

        // Get deploymentMode from settings
        let deploymentMode = 'CDS';
        await dbConnect();
        try {
            const setting = await Setting.findOne({ key: 'deploymentMode' });
            if (setting && setting.value) deploymentMode = setting.value;
        } catch (e) {
            console.error('Failed to read deploymentMode setting', e);
        }

        // Clear empty evals only on the first batch (when lastProcessedId is not set) and skipEmptyCleanup is false
        if (!lastProcessedId && !skipEmptyCleanup) {
            try {
                // Find evals that are empty (no expertFeedback, processed=false, or hasMatches=false)
                const emptyEvals = await Eval.find({
                    $or: [
                        { expertFeedback: null },
                        { processed: false },
                        { hasMatches: false }
                    ]
                });
                if (emptyEvals.length > 0) {
                    const emptyEvalIds = emptyEvals.map(e => e._id);
                    await Eval.deleteMany({ _id: { $in: emptyEvalIds } });
                    // Remove autoEval reference from interactions
                    await Interaction.updateMany(
                        { autoEval: { $in: emptyEvalIds } },
                        { $unset: { autoEval: "" } }
                    );
                }
            } catch (e) {
                console.error('Failed to clear empty evals', e);
            }
        }

        // Build a time filter for updatedAt if provided
        let timeFilter = {};
        if (startTime || endTime) {
            timeFilter.updatedAt = {};
            if (startTime) timeFilter.updatedAt.$gte = new Date(startTime);
            if (endTime) timeFilter.updatedAt.$lte = new Date(endTime);
        }

        const result = await EvaluationService.processEvaluationsForDuration(
            duration,
            !regenerateAll,
            lastProcessedId,
            deploymentMode,
            timeFilter // pass as extra arg
        );
        res.status(200).json(result);
    } catch (error) {
        console.error('Error in generate-evals:', error);
        res.status(500).json({ error: 'Failed to generate evaluations' });
    }
}