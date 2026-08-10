import dbConnect from '../db/db-connect.js';
import { Chat } from '../../models/chat.js';
import { withProtection } from '../../middleware/auth.js';
import { parseRequestFilters, executeWithRetry } from './metrics-common.js';

// How many chats to list. This is a manual-review list (not a chart), so a
// generous-but-bounded cap keeps the payload small without hiding recent
// flags — most recent first.
const TOP_N = 100;

// Chats with at least one expert-flagged content issue (sentence1-4
// ContentIssue on the ExpertFeedback record) in the current filter scope.
// Same hasContentIssue definition as metrics-expert-feedback.js's count, but
// projects the chat/interaction identifiers needed for review-mode deep
// links instead of aggregating a total.
function buildContentIssueChatsPipeline(dateFilter, extraFilters = [], departmentFilter = []) {
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
                    { 'expertFeedback.sentence1ContentIssue': true },
                    { 'expertFeedback.sentence2ContentIssue': true },
                    { 'expertFeedback.sentence3ContentIssue': true },
                    { 'expertFeedback.sentence4ContentIssue': true }
                ]
            }
        },
        {
            // Same split as metrics-expert-feedback.js's hasContentIssueError/
            // hasContentIssueNeedsImprovement: the raw "answer error" signal (a
            // sentence/total scored 0), not the priority category. Harmful is a
            // separate flag from contentIssue (independent checkboxes) and gets
            // its own dedicated list under Safety metrics — see
            // metrics-harmful-chats.js — rather than a 3rd status here.
            $addFields: {
                hasErrorSignal: {
                    $or: [
                        { $eq: ['$expertFeedback.sentence1Score', 0] },
                        { $eq: ['$expertFeedback.sentence2Score', 0] },
                        { $eq: ['$expertFeedback.sentence3Score', 0] },
                        { $eq: ['$expertFeedback.sentence4Score', 0] },
                        { $eq: ['$expertFeedback.totalScore', 0] }
                    ]
                }
            }
        },
        {
            $project: {
                _id: 0,
                chatId: 1,
                pageLanguage: 1,
                createdAt: 1,
                interactionId: '$interactions._id',
                status: { $cond: ['$hasErrorSignal', 'hasError', 'needsImprovement'] }
            }
        },
        // Grouped by status (errors first), most recent within each group.
        { $sort: { status: 1, createdAt: -1 } },
        { $limit: TOP_N }
    );

    return stages;
}

async function getContentIssueChatsMetrics(req, res) {
    if (req.method !== 'GET') return res.status(405).json({ message: 'Method not allowed' });
    try {
        await dbConnect();
        const { dateFilter, extraFilterConditions, departmentFilter } = parseRequestFilters(req);
        if (!dateFilter.createdAt) return res.status(400).json({ error: 'Invalid date range' });

        const rows = await executeWithRetry(() =>
            Chat.aggregate(buildContentIssueChatsPipeline(dateFilter, extraFilterConditions, departmentFilter)).allowDiskUse(true)
        );

        const contentIssueChats = rows.map(r => ({
            chatId: r.chatId,
            interactionId: r.interactionId ? String(r.interactionId) : '',
            pageLanguage: r.pageLanguage || '',
            createdAt: r.createdAt,
            status: r.status
        }));

        return res.status(200).json({ success: true, metrics: { contentIssueChats } });
    } catch (error) {
        console.error('Error in content issue chats metrics:', error);
        return res.status(500).json({ error: 'Failed to fetch content issue chats' });
    }
}

export default withProtection(getContentIssueChatsMetrics);
