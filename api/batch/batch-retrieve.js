import dbConnect from '../db/db-connect.js';
import { Batch } from '../../models/batch.js';
import { BatchItem } from '../../models/batchItem.js';
import { authMiddleware, adminMiddleware, withProtection } from '../../middleware/auth.js';

async function batchRetrieveHandler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ message: 'Method Not Allowed' });
    }

    const { batchId } = req.query;

    if (!batchId) {
        return res.status(400).json({ message: 'Batch ID is required' });
    }

    try {
        await dbConnect();

        const batch = await Batch.findById(batchId);
        if (!batch) {
            return res.status(404).json({ message: 'Batch not found' });
        }

        const items = await BatchItem.find({ batch: batch._id })
            .sort({ rowIndex: 1 })
            .select('rowIndex originalData chat')
            .lean();

        const out = batch.toObject();
        out.items = items;
        return res.status(200).json(out);
    } catch (error) {
        console.error('Error retrieving batch:', error);
        return res.status(500).json({ message: 'Internal Server Error', error: error.message });
    }
}

export default function handler(req, res) {
    return withProtection(batchRetrieveHandler, authMiddleware, adminMiddleware)(req, res);
}