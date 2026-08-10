import dbConnect from '../db/db-connect.js';
import { Chat } from '../../models/chat.js';
import { withProtection } from '../../middleware/auth.js';
import { parseRequestFilters, executeWithRetry } from './metrics-common.js';

// How many chats to list. This is a manual-review list (not a chart), so a
// generous-but-bounded cap keeps the payload small without hiding recent
// flags — most recent first.
const TOP_N = 100;

// Chats with at least one expert-flagged harmful sentence (sentence1-4Harmful
// on the ExpertFeedback record) in the current filter scope. Harmful is an
// independent flag from contentIssue (separate checkboxes in
// ExpertFeedbackComponent.js — harmful only renders once a sentence is
// scored 0), so this is its own list rather than a status within
// metrics-content-issue-chats.js. Same shape/pattern as that endpoint,
// minus the status classification (every row here is harmful by definition).
function buildHarmfulChatsPipeline(dateFilter, extraFilters = [], departmentFilter = []) {
    const stages = [
        { $match: dateFilter },
        {
            $lookup: {
                from: 'interactions',
                localField: 'interactions',
                foreignField: '_id',
                as: 'interactions'
            }
        },
        { $unwind: '$interactions' },
        ...(extraFilters.length > 0 ? [{ $match: { $and: extraFilters } }] : []),
    ];

    if (departmentFilter.length > 0) {
        stages.push(
            {
                $lookup: {
                    from: 'contexts',
                    localField: 'interactions.context',
                    foreignField: '_id',
                    as: 'ctx'
                }
            },
            { $addFields: { department: { $ifNull: [{ $arrayElemAt: ['$ctx.department', 0] }, 'Unknown'] } } },
            { $match: { $and: departmentFilter } },
        );
    }

    stages.push(
        {
            $lookup: {
                from: 'expertfeedbacks',
                localField: 'interactions.expertFeedback',
                foreignField: '_id',
                as: 'ef'
            }
        },
        { $addFields: { expertFeedback: { $arrayElemAt: ['$ef', 0] } } },
        // Exclude blank ExpertFeedback records created solely by the neverStale
        // flag (totalScore: null means no human scored the interaction).
        { $match: { expertFeedback: { $ne: null }, 'expertFeedback.totalScore': { $ne: null } } },
        {
            $match: {
                $or: [
                    { 'expertFeedback.sentence1Harmful': true },
                    { 'expertFeedback.sentence2Harmful': true },
                    { 'expertFeedback.sentence3Harmful': true },
                    { 'expertFeedback.sentence4Harmful': true }
                ]
            }
        },
        {
            $project: {
                _id: 0,
                chatId: 1,
                pageLanguage: 1,
                createdAt: 1,
                interactionId: '$interactions._id'
            }
        },
        { $sort: { createdAt: -1 } },
        { $limit: TOP_N }
    );

    return stages;
}

async function getHarmfulChatsMetrics(req, res) {
    if (req.method !== 'GET') return res.status(405).json({ message: 'Method not allowed' });
    try {
        await dbConnect();
        const { dateFilter, extraFilterConditions, departmentFilter } = parseRequestFilters(req);
        if (!dateFilter.createdAt) return res.status(400).json({ error: 'Invalid date range' });

        const rows = await executeWithRetry(() =>
            Chat.aggregate(buildHarmfulChatsPipeline(dateFilter, extraFilterConditions, departmentFilter)).allowDiskUse(true)
        );

        const harmfulChats = rows.map(r => ({
            chatId: r.chatId,
            interactionId: r.interactionId ? String(r.interactionId) : '',
            pageLanguage: r.pageLanguage || '',
            createdAt: r.createdAt
        }));

        return res.status(200).json({ success: true, metrics: { harmfulChats } });
    } catch (error) {
        console.error('Error in harmful chats metrics:', error);
        return res.status(500).json({ error: 'Failed to fetch harmful chats' });
    }
}

export default withProtection(getHarmfulChatsMetrics);
