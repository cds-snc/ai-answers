import mongoose from 'mongoose';
import dbConnect from '../db/db-connect.js';
import { Chat } from '../../models/chat.js';
import { Interaction } from '../../models/interaction.js';
import { authMiddleware, partnerOrAdminMiddleware, withProtection } from '../../middleware/auth.js';
import { frForProgram } from '../util/programActionFr.js';
import { MOST_USED_EVALS_LIMIT } from '../../src/config/workflows.js';
import { parseRequestFilters, executeWithRetry } from './metrics-common.js';
import { evalInformedAnswerStages } from './metrics-eval-informed-chats.js';

// Candidates ranked in the database. More than the list shows, so that
// evaluations deleted since they were used (dropped in loadDetails) don't
// leave the list short.
const CANDIDATE_LIMIT = MOST_USED_EVALS_LIMIT * 2;

// Most-used evaluations, for the partner dashboard: the human evaluations
// injected into the most answers in the date range. Same answers and filters
// as the eval-informed chats list — both build on evalInformedAnswerStages,
// which keeps the chat-level `user` field the userType/reviewer filters read.
//
// Two steps. The aggregation unwinds each answer's context.qaMatches and
// counts uses per evaluated interaction, so only the top candidates leave the
// database. The details of those N (score, evaluation date, service, chat,
// question number) are then read with two indexed finds — qaMatches stores
// interactionId as a string, and doing it in JS avoids depending on
// $toObjectId on DocumentDB.
export function buildMostUsedEvalsPipeline(dateFilter, extraFilters = [], departmentFilter = []) {
    return [
        { $match: dateFilter },
        ...evalInformedAnswerStages(extraFilters, departmentFilter),
        // Only now narrow the document: the filters above needed the whole chat.
        { $project: { qaMatches: { $ifNull: [{ $arrayElemAt: ['$ctx.qaMatches', 0] }, []] } } },
        { $unwind: '$qaMatches' },
        { $match: { 'qaMatches.interactionId': { $nin: [null, ''] } } },
        { $group: { _id: '$qaMatches.interactionId', uses: { $sum: 1 } } },
        { $sort: { uses: -1, _id: 1 } },
        { $limit: CANDIDATE_LIMIT }
    ];
}

async function loadDetails(ranked) {
    const ids = ranked.map((r) => r._id).filter((id) => mongoose.isValidObjectId(id));
    if (ids.length === 0) return [];
    const objectIds = ids.map((id) => new mongoose.Types.ObjectId(id));
    const [interactions, chats] = await Promise.all([
        Interaction.find({ _id: { $in: objectIds } })
            .select('expertFeedback context')
            .populate({ path: 'expertFeedback', select: 'totalScore createdAt' })
            .populate({ path: 'context', select: 'program' })
            .lean(),
        Chat.find({ interactions: { $in: objectIds } }).select('chatId pageLanguage interactions').lean()
    ]);
    const interactionById = new Map(interactions.map((i) => [String(i._id), i]));
    // Only the requested ids; if two chats ever reference the same
    // interaction, the first one found is kept rather than the last.
    const wanted = new Set(ids);
    const chatByInteraction = new Map();
    for (const chat of chats) {
        (chat.interactions || []).forEach((iid, index) => {
            const key = String(iid);
            if (wanted.has(key) && !chatByInteraction.has(key)) {
                chatByInteraction.set(key, { chat, questionNumber: index + 1 });
            }
        });
    }

    return ranked
        .map((r) => {
            const interaction = interactionById.get(r._id);
            const found = chatByInteraction.get(r._id);
            // An evaluation deleted since it was used has nothing to link to.
            if (!interaction || !found) return null;
            const program = interaction.context?.program;
            const usableProgram = program && program !== 'unknown' ? program : '';
            return {
                chatId: found.chat.chatId,
                interactionId: r._id,
                pageLanguage: found.chat.pageLanguage || '',
                questionNumber: found.questionNumber,
                program: usableProgram,
                programFr: usableProgram ? frForProgram(usableProgram) : '',
                totalScore: typeof interaction.expertFeedback?.totalScore === 'number' ? interaction.expertFeedback.totalScore : null,
                evaluatedAt: interaction.expertFeedback?.createdAt || null,
                uses: r.uses
            };
        })
        .filter(Boolean)
        .slice(0, MOST_USED_EVALS_LIMIT);
}

async function getMostUsedEvals(req, res) {
    if (req.method !== 'GET') return res.status(405).json({ message: 'Method not allowed' });
    try {
        await dbConnect();
        const { dateFilter, extraFilterConditions, departmentFilter } = await parseRequestFilters(req);
        if (!dateFilter.createdAt) return res.status(400).json({ error: 'Invalid date range' });

        const ranked = await executeWithRetry(() =>
            Chat.aggregate(buildMostUsedEvalsPipeline(dateFilter, extraFilterConditions, departmentFilter)).allowDiskUse(true)
        );
        const mostUsedEvals = await loadDetails(ranked);

        return res.status(200).json({ success: true, metrics: { mostUsedEvals } });
    } catch (error) {
        console.error('Error in most-used evaluations metrics:', error);
        return res.status(500).json({ error: 'Failed to fetch most-used evaluations' });
    }
}

export default withProtection(getMostUsedEvals, authMiddleware, partnerOrAdminMiddleware);
