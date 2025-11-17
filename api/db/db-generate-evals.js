
import dbConnect from './db-connect.js';
import EvaluationService from '../../services/EvaluationService.js';
import config from '../../config/eval.js';
import { Setting } from '../../models/setting.js';


export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { action, startTime, endTime, lastProcessedId, onlyEmpty } = req.body;
    const duration = config.evalBatchProcessingDuration;

    try {
        await dbConnect();

        // Build a time filter for interaction createdAt if provided
        let timeFilter = {};
        if (startTime || endTime) {
            timeFilter.createdAt = {};
            // If date-only string, convert to full-day range
            if (startTime) {
                // If startTime is date-only (YYYY-MM-DD), set to 00:00:00.000Z
                const start = startTime.length === 10
                    ? new Date(startTime + 'T00:00:00.000Z')
                    : new Date(startTime);
                timeFilter.createdAt.$gte = start;
            }
            if (endTime) {
                // If endTime is date-only (YYYY-MM-DD), set to 23:59:59.999Z
                const end = endTime.length === 10
                    ? new Date(endTime + 'T23:59:59.999Z')
                    : new Date(endTime);
                timeFilter.createdAt.$lte = end;
            }
        }

        if (action === 'delete') {
            // Delegate to EvaluationService for deletion
            const result = await EvaluationService.deleteEvaluations({ timeFilter, onlyEmpty });
            return res.status(200).json(result);
        }

        if (action === 'generate') {
            // Only generate evaluations for interactions in the timespan that do not have an evaluation
            const result = await EvaluationService.processEvaluationsForDuration(
                duration,
                lastProcessedId,
                timeFilter
            );
            return res.status(200).json(result);
        }

        return res.status(400).json({ error: 'Invalid action' });
    } catch (error) {
        console.error('Error in generate-evals:', error);
        res.status(500).json({ error: 'Failed to process evaluations' });
    }
}