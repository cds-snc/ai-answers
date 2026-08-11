import dbConnect from '../db/db-connect.js';
import { Chat } from '../../models/chat.js';
import { withProtection } from '../../middleware/auth.js';
import { parseRequestFilters, executeWithRetry, buildFlaggedChatsBasePipeline } from './metrics-common.js';

// How many chats to list. This is a manual-review list (not a chart), so a
// generous-but-bounded cap keeps the payload small without hiding recent
// flags — most recent first.
// TODO: hasError sorts before needsImprovement (see $sort below), so if
// hasError count ever reaches TOP_N in the filtered range, needsImprovement
// rows get pushed out of the list entirely with no indication anything was
// excluded. Watch for that — e.g. check whether every row in a response is
// 'hasError' with none 'needsImprovement' — and fix properly (independent
// per-status caps, or real pagination) if it's actually happening rather
// than pre-building it for a case that may never occur.
const TOP_N = 100;

// Chats with at least one expert-flagged content issue (sentence1-4
// ContentIssue on the ExpertFeedback record) in the current filter scope.
// Same hasContentIssue definition as metrics-expert-feedback.js's count, but
// projects the chat/interaction identifiers needed for review-mode deep
// links instead of aggregating a total.
function buildContentIssueChatsPipeline(dateFilter, extraFilters = [], departmentFilter = []) {
    const stages = buildFlaggedChatsBasePipeline(dateFilter, extraFilters, departmentFilter);

    stages.push(
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
        // See the TOP_N TODO above for the starvation risk this sort+limit
        // combination carries.
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

// TODO: unauthenticated, like most of api/metrics/ (only metrics-blocked.js and
// metrics-technical.js pass authMiddleware/partnerOrAdminMiddleware). This one
// surfaces chatId/interactionId for content-issue-flagged chats — validate
// whether that should require auth before deciding whether/how to fix it,
// as part of the wider api/metrics/ review, not just this file in isolation.
export default withProtection(getContentIssueChatsMetrics);
