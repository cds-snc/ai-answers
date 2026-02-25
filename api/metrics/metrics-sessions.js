import dbConnect from '../db/db-connect.js';
import { Chat } from '../../models/chat.js';
import { withProtection } from '../../middleware/auth.js';
import { getPartnerEvalAggregationExpression, getAiEvalAggregationExpression } from '../util/chat-filters.js';
import { parseRequestFilters, executeWithRetry } from './metrics-common.js';

/**
 * Build session stats pipeline that properly applies all filters.
 * When filters are applied (e.g., answerType), we count sessions that have
 * at least one interaction matching those filters.
 */
function buildSessionStatsPipeline(dateFilter, extraFilters = [], departmentFilter = [], answerTypeFilter = null, partnerEvalFilter = null, aiEvalFilter = null) {
    const hasAdvancedFilters = answerTypeFilter || partnerEvalFilter || aiEvalFilter || extraFilters.length > 0 || departmentFilter.length > 0;

    if (!hasAdvancedFilters) {
        // Simple path: no advanced filters, just date filter
        return [
            { $match: dateFilter },
            {
                $lookup: {
                    from: 'interactions',
                    localField: 'interactions',
                    foreignField: '_id',
                    as: 'interactions'
                }
            },
            {
                $project: {
                    chatId: 1,
                    questionCount: { $size: '$interactions' },
                    pageLanguage: 1
                }
            },
            {
                $group: {
                    _id: null,
                    totalConversations: { $sum: 1 },
                    totalConversationsEn: { $sum: { $cond: [{ $eq: ['$pageLanguage', 'en'] }, 1, 0] } },
                    totalConversationsFr: { $sum: { $cond: [{ $eq: ['$pageLanguage', 'fr'] }, 1, 0] } },
                    singleQuestion: { $sum: { $cond: [{ $eq: ['$questionCount', 1] }, 1, 0] } },
                    singleQuestionEn: { $sum: { $cond: [{ $and: [{ $eq: ['$questionCount', 1] }, { $eq: ['$pageLanguage', 'en'] }] }, 1, 0] } },
                    singleQuestionFr: { $sum: { $cond: [{ $and: [{ $eq: ['$questionCount', 1] }, { $eq: ['$pageLanguage', 'fr'] }] }, 1, 0] } },
                    twoQuestions: { $sum: { $cond: [{ $eq: ['$questionCount', 2] }, 1, 0] } },
                    twoQuestionsEn: { $sum: { $cond: [{ $and: [{ $eq: ['$questionCount', 2] }, { $eq: ['$pageLanguage', 'en'] }] }, 1, 0] } },
                    twoQuestionsFr: { $sum: { $cond: [{ $and: [{ $eq: ['$questionCount', 2] }, { $eq: ['$pageLanguage', 'fr'] }] }, 1, 0] } },
                    threeQuestions: { $sum: { $cond: [{ $eq: ['$questionCount', 3] }, 1, 0] } },
                    threeQuestionsEn: { $sum: { $cond: [{ $and: [{ $eq: ['$questionCount', 3] }, { $eq: ['$pageLanguage', 'en'] }] }, 1, 0] } },
                    threeQuestionsFr: { $sum: { $cond: [{ $and: [{ $eq: ['$questionCount', 3] }, { $eq: ['$pageLanguage', 'fr'] }] }, 1, 0] } }
                }
            }
        ];
    }

    // Advanced path: filter interactions first, then count matching sessions
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
        // Apply extra filters (userType, etc.)
        ...(extraFilters.length > 0 ? [{ $match: { $and: extraFilters } }] : []),
        // Lookup context for pageLanguage and department
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
                department: { $arrayElemAt: ['$ctx.department', 0] }
            }
        }
    ];

    // Apply department filter (after context lookup)
    if (departmentFilter.length > 0) {
        stages.push({ $match: { $and: departmentFilter } });
    }

    // Apply answerType filter
    if (answerTypeFilter) {
        stages.push(
            {
                $lookup: {
                    from: 'answers',
                    localField: 'interactions.answer',
                    foreignField: '_id',
                    as: 'ans'
                }
            },
            {
                $addFields: {
                    answerType: { $ifNull: [{ $arrayElemAt: ['$ans.answerType', 0] }, 'normal'] }
                }
            },
            { $match: answerTypeFilter },
            { $project: { ans: 0 } }
        );
    }

    // Apply partnerEval filter
    if (partnerEvalFilter) {
        stages.push(
            {
                $lookup: {
                    from: 'expertfeedbacks',
                    localField: 'interactions.expertFeedback',
                    foreignField: '_id',
                    as: 'ef'
                }
            },
            {
                $addFields: {
                    category: getPartnerEvalAggregationExpression({ $arrayElemAt: ['$ef', 0] })
                }
            },
            { $match: partnerEvalFilter },
            { $project: { ef: 0, category: 0 } }
        );
    }

    // Apply aiEval filter
    if (aiEvalFilter) {
        stages.push(
            {
                $lookup: {
                    from: 'evals',
                    localField: 'interactions.autoEval',
                    foreignField: '_id',
                    as: 'ae'
                }
            },
            {
                $lookup: {
                    from: 'expertfeedbacks',
                    localField: 'ae.expertFeedback',
                    foreignField: '_id',
                    as: 'ae_ef'
                }
            },
            {
                $addFields: {
                    category: getAiEvalAggregationExpression({ $arrayElemAt: ['$ae_ef', 0] })
                }
            },
            { $match: aiEvalFilter },
            { $project: { ae: 0, ae_ef: 0, category: 0 } }
        );
    }

    // Now group by chatId to get unique sessions that have matching interactions
    // Count how many matching interactions per session
    stages.push(
        {
            $group: {
                _id: '$chatId',
                pageLanguage: { $first: '$pageLanguage' },
                matchingQuestionCount: { $sum: 1 }
            }
        },
        {
            $group: {
                _id: null,
                totalConversations: { $sum: 1 },
                totalConversationsEn: { $sum: { $cond: [{ $eq: ['$pageLanguage', 'en'] }, 1, 0] } },
                totalConversationsFr: { $sum: { $cond: [{ $eq: ['$pageLanguage', 'fr'] }, 1, 0] } },
                singleQuestion: { $sum: { $cond: [{ $eq: ['$matchingQuestionCount', 1] }, 1, 0] } },
                singleQuestionEn: { $sum: { $cond: [{ $and: [{ $eq: ['$matchingQuestionCount', 1] }, { $eq: ['$pageLanguage', 'en'] }] }, 1, 0] } },
                singleQuestionFr: { $sum: { $cond: [{ $and: [{ $eq: ['$matchingQuestionCount', 1] }, { $eq: ['$pageLanguage', 'fr'] }] }, 1, 0] } },
                twoQuestions: { $sum: { $cond: [{ $eq: ['$matchingQuestionCount', 2] }, 1, 0] } },
                twoQuestionsEn: { $sum: { $cond: [{ $and: [{ $eq: ['$matchingQuestionCount', 2] }, { $eq: ['$pageLanguage', 'en'] }] }, 1, 0] } },
                twoQuestionsFr: { $sum: { $cond: [{ $and: [{ $eq: ['$matchingQuestionCount', 2] }, { $eq: ['$pageLanguage', 'fr'] }] }, 1, 0] } },
                threeQuestions: { $sum: { $cond: [{ $gte: ['$matchingQuestionCount', 3] }, 1, 0] } },
                threeQuestionsEn: { $sum: { $cond: [{ $and: [{ $gte: ['$matchingQuestionCount', 3] }, { $eq: ['$pageLanguage', 'en'] }] }, 1, 0] } },
                threeQuestionsFr: { $sum: { $cond: [{ $and: [{ $gte: ['$matchingQuestionCount', 3] }, { $eq: ['$pageLanguage', 'fr'] }] }, 1, 0] } }
            }
        }
    );

    return stages;
}

async function getSessionMetrics(req, res) {
    if (req.method !== 'GET') return res.status(405).json({ message: 'Method not allowed' });
    try {
        await dbConnect();
        const { dateFilter, extraFilterConditions, departmentFilter, answerTypeFilter, partnerEvalFilter, aiEvalFilter } = parseRequestFilters(req);
        if (!dateFilter.createdAt) return res.status(400).json({ error: 'Invalid date range' });

        const result = await executeWithRetry(() => Chat.aggregate(buildSessionStatsPipeline(dateFilter, extraFilterConditions, departmentFilter, answerTypeFilter, partnerEvalFilter, aiEvalFilter)).allowDiskUse(true));
        const session = result[0] || {};

        const metrics = {
            totalConversations: session.totalConversations || 0,
            totalConversationsEn: session.totalConversationsEn || 0,
            totalConversationsFr: session.totalConversationsFr || 0,
            sessionsByQuestionCount: {
                singleQuestion: { total: session.singleQuestion || 0, en: session.singleQuestionEn || 0, fr: session.singleQuestionFr || 0 },
                twoQuestions: { total: session.twoQuestions || 0, en: session.twoQuestionsEn || 0, fr: session.twoQuestionsFr || 0 },
                threeQuestions: { total: session.threeQuestions || 0, en: session.threeQuestionsEn || 0, fr: session.threeQuestionsFr || 0 }
            }
        };
        return res.status(200).json({ success: true, metrics });
    } catch (error) {
        console.error('Error in session metrics:', error);
        return res.status(500).json({ error: 'Failed to fetch session metrics' });
    }
}

export default withProtection(getSessionMetrics);
