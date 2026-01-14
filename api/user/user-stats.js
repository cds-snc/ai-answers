import dbConnect from '../db/db-connect.js';
import { User } from '../../models/user.js';
import { authMiddleware, adminMiddleware, withProtection } from '../../middleware/auth.js';

async function userStatsHandler(req, res) {
    if (req.method !== 'GET') {
        res.setHeader('Allow', ['GET']);
        return res.status(405).end(`Method ${req.method} Not Allowed`);
    }

    try {
        await dbConnect();

        // Calculate the date 7 days ago
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        // Count new inactive users (signed up in last 7 days and not active)
        const newInactiveCount = await User.countDocuments({
            active: false,
            createdAt: { $gte: sevenDaysAgo }
        });

        // Count total inactive users
        const totalInactiveCount = await User.countDocuments({
            active: false
        });

        res.status(200).json({
            newInactiveCount,
            totalInactiveCount
        });
    } catch (error) {
        console.error('Error retrieving user stats:', error);
        res.status(500).json({
            message: 'Failed to retrieve user stats',
            error: error.message
        });
    }
}

// Apply protection - admin only
export default function handler(req, res) {
    return withProtection(userStatsHandler, authMiddleware, adminMiddleware)(req, res);
}
