import dbConnect from './db-connect.js';
import { Eval } from '../../models/eval.js';
import { ExpertFeedback } from '../../models/expertFeedback.js';
import { Interaction } from '../../models/interaction.js';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { startTime, endTime } = req.body;
        await dbConnect();

        // Build a time filter for updatedAt if provided
        let timeFilter = {};
        if (startTime || endTime) {
            timeFilter.updatedAt = {};
            if (startTime) timeFilter.updatedAt.$gte = new Date(startTime);
            if (endTime) timeFilter.updatedAt.$lte = new Date(endTime);
        }

        // Find evals in the time range
        const evalsToDelete = await Eval.find(timeFilter);
        const evalIds = evalsToDelete.map(e => e._id);
        const expertFeedbackIds = evalsToDelete.map(e => e.expertFeedback).filter(Boolean);

        // Delete evals
        await Eval.deleteMany({ _id: { $in: evalIds } });
        // Delete associated expert feedback
        if (expertFeedbackIds.length > 0) {
            await ExpertFeedback.deleteMany({ _id: { $in: expertFeedbackIds } });
        }
        // Remove autoEval reference from interactions
        await Interaction.updateMany(
            { autoEval: { $in: evalIds } },
            { $unset: { autoEval: "" } }
        );

        res.status(200).json({ deleted: evalIds.length, expertFeedbackDeleted: expertFeedbackIds.length });
    } catch (error) {
        console.error('Error deleting evaluations:', error);
        res.status(500).json({ error: 'Failed to delete evaluations' });
    }
}
