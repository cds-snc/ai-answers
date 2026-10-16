import dbConnect from '../db/db-connect.js';
import { Chat } from '../../models/chat.js';
import { authMiddleware, partnerOrAdminMiddleware, withProtection } from '../../middleware/auth.js';
import { getEvalInformedAggregationExpression } from '../util/chat-filters.js';
import { EVAL_INFORMED_WORKFLOW, EVAL_INFORMED_CHATS_LIMIT } from '../../src/config/workflows.js';
import { parseRequestFilters, executeWithRetry, questionNumberLookupStages } from './metrics-common.js';

// A sample for spot-checking, not a full list: the partner dashboard's
// eval-informed card shows the rate, and this gives reviewers a few recent
// examples to open. Review mode's "Past evaluations used" panel shows which
// evaluations each one used.
const TOP_N = EVAL_INFORMED_CHATS_LIMIT;

// Most recent eval-informed questions in the current filter scope. Same
// definition as metrics-usage.js's evalInformed count: answered by the
// eval-informed workflow, with at least one expert-rated example injected.
//
// Sorted newest-first up front (index-backed on Chat.createdAt) and never
// re-sorted, so every later stage streams and $limit stops the pipeline once
// it has TOP_N rows — the joins run only on the newest chats rather than on
// every chat in the range. Don't add a $sort after the lookups: it would
// force the whole range through them again.
export function buildEvalInformedChatsPipeline(dateFilter, extraFilters = [], departmentFilter = []) {
    return [
        { $match: dateFilter },
        { $sort: { createdAt: -1 } },
        ...questionNumberLookupStages(),
        ...(extraFilters.length > 0 ? [{ $match: { $and: extraFilters } }] : []),
        // Before the context lookup, so other workflows' questions skip it.
        { $match: { 'interactions.workflow': EVAL_INFORMED_WORKFLOW } },
        {
            $lookup: {
                from: 'contexts',
                localField: 'interactions.context',
                foreignField: '_id',
                as: 'ctx'
            }
        },
        {
            $addFields: {
                department: { $ifNull: [{ $arrayElemAt: ['$ctx.department', 0] }, 'Unknown'] },
                evalInformed: getEvalInformedAggregationExpression({ $arrayElemAt: ['$ctx.qaMatches', 0] })
            }
        },
        ...(departmentFilter.length > 0 ? [{ $match: { $and: departmentFilter } }] : []),
        { $match: { evalInformed: true } },
        {
            $project: {
                _id: 0,
                chatId: 1,
                pageLanguage: 1,
                createdAt: 1,
                interactionId: '$interactions._id',
                questionNumber: 1
            }
        },
        { $limit: TOP_N }
    ];
}

async function getEvalInformedChatsMetrics(req, res) {
    if (req.method !== 'GET') return res.status(405).json({ message: 'Method not allowed' });
    try {
        await dbConnect();
        const { dateFilter, extraFilterConditions, departmentFilter } = await parseRequestFilters(req);
        if (!dateFilter.createdAt) return res.status(400).json({ error: 'Invalid date range' });

        const rows = await executeWithRetry(() =>
            Chat.aggregate(buildEvalInformedChatsPipeline(dateFilter, extraFilterConditions, departmentFilter)).allowDiskUse(true)
        );

        const evalInformedChats = rows.map(r => ({
            chatId: r.chatId,
            interactionId: r.interactionId ? String(r.interactionId) : '',
            pageLanguage: r.pageLanguage || '',
            createdAt: r.createdAt,
            questionNumber: r.questionNumber
        }));

        return res.status(200).json({ success: true, metrics: { evalInformedChats } });
    } catch (error) {
        console.error('Error in eval-informed chats metrics:', error);
        return res.status(500).json({ error: 'Failed to fetch eval-informed chats' });
    }
}

export default withProtection(getEvalInformedChatsMetrics, authMiddleware, partnerOrAdminMiddleware);
