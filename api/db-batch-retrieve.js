import dbConnect from './db-connect.js';
import { Batch } from '../models/batch.js';

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ message: 'Method Not Allowed' });
    }

    const { batchId } = req.query;

    if (!batchId) {
        return res.status(400).json({ message: 'Batch ID is required' });
    }

    try {
        await dbConnect();
        const batch = await Batch.findOne({ batchId }).populate({
            path: 'interactions',
            populate: [
                { path: 'context' },
                { path: 'expertFeedback' },
                { path: 'question' },
                {
                    path: 'answer',
                    populate: [
                        { path: 'sentences' },
                        { path: 'citation' }
                    ]
                }
            ]
        });


        if (!batch) {
            return res.status(404).json({ message: 'Batch not found' });
        }
        res.status(200).json(batch);
    } catch (error) {
        console.error('Error retrieving batch:', error);
        res.status(500).json({ message: 'Failed to retrieve batch', error: error.message });
    }
}