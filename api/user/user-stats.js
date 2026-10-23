import dbConnect from '../db/db-connect.js';
import mongoose from 'mongoose';
import { User } from '../../models/user.js';
import { Interaction } from '../../models/interaction.js';
import { ExpertFeedback } from '../../models/expertFeedback.js';
import { authMiddleware, partnerOrAdminMiddleware, withProtection } from '../../middleware/auth.js';
import { requireObjectIdString } from '../util/db-query.js';
import { deriveExpertFeedbackCategory, EXPERT_FEEDBACK_CATEGORY_FIELDS } from '../util/chat-filters.js';

// Questions assigned to this user with no expert score yet - the same
// "Pending" rows AccountPage.js's assigned-questions table shows.
async function countPendingAssigned(userId) {
    const assigned = await Interaction.find(
        { assignedTo: new mongoose.Types.ObjectId(userId) },
        { expertFeedback: 1 }
    ).lean();
    const feedbackIds = assigned.map((i) => i.expertFeedback).filter(Boolean);
    const feedback = feedbackIds.length
        ? await ExpertFeedback.find({ _id: { $in: feedbackIds } }, EXPERT_FEEDBACK_CATEGORY_FIELDS).lean()
        : [];
    const scored = new Set(
        feedback.filter((ef) => deriveExpertFeedbackCategory(ef)).map((ef) => String(ef._id))
    );
    return assigned.filter((i) => !i.expertFeedback || !scored.has(String(i.expertFeedback))).length;
}

async function userStatsHandler(req, res) {
    if (req.method !== 'GET') {
        res.setHeader('Allow', ['GET']);
        return res.status(405).end(`Method ${req.method} Not Allowed`);
    }

    try {
        await dbConnect();
        const userId = requireObjectIdString(req.user?.userId, 'user ID');

        const pendingAssignedCount = await countPendingAssigned(userId);

        // Account counts are admin-only
        if (req.user.role !== 'admin') {
            return res.status(200).json({ pendingAssignedCount });
        }

        // Calculate the date 7 days ago. Must match UsersPage.js's ?show=new
        // filter - see the TODO there about one shared "last 7 days" helper.
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
            pendingAssignedCount,
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

// Partners get their own assigned count; admins also get account counts
export default function handler(req, res) {
    return withProtection(userStatsHandler, authMiddleware, partnerOrAdminMiddleware)(req, res);
}
