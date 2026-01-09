// api/db/db-metrics-dashboard.js
// Server-side metrics aggregation for DocumentDB compatibility
// Uses multiple parallel pipelines instead of $facet

import dbConnect from './db-connect.js';
import { Chat } from '../../models/chat.js';
import { authMiddleware, adminMiddleware, withProtection } from '../../middleware/auth.js';
import { getPartnerEvalAggregationExpression, getAiEvalAggregationExpression } from '../utils/chat-filters.js';

const DATE_TIME_REGEX = /^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?)?$/;

const parseLocalDateTime = (value, { timezoneOffsetMinutes = 0, endOfDayIfNoTime = false } = {}) => {
    if (typeof value !== 'string') return null;
    const match = value.match(DATE_TIME_REGEX);
    if (!match) return null;

    const [, yearStr, monthStr, dayStr, hourStr, minuteStr, secondStr, msStr] = match;
    const year = Number(yearStr);
    const month = Number(monthStr);
    const day = Number(dayStr);
    const hasTime = hourStr !== undefined && minuteStr !== undefined;
    const hour = hasTime ? Number(hourStr) : endOfDayIfNoTime ? 23 : 0;
    const minute = hasTime ? Number(minuteStr) : endOfDayIfNoTime ? 59 : 0;
    const second = hasTime ? Number(secondStr || 0) : endOfDayIfNoTime ? 59 : 0;
    const millisecond = hasTime ? Number(msStr || 0) : endOfDayIfNoTime ? 999 : 0;

    if (
        !Number.isFinite(year) ||
        !Number.isFinite(month) || month < 1 || month > 12 ||
        !Number.isFinite(day) || day < 1 || day > 31 ||
        !Number.isFinite(hour) || hour < 0 || hour > 23 ||
        !Number.isFinite(minute) || minute < 0 || minute > 59 ||
        !Number.isFinite(second) || second < 0 || second > 59 ||
        !Number.isFinite(millisecond) || millisecond < 0 || millisecond > 999
    ) {
        return null;
    }

    const offset = Number.isFinite(timezoneOffsetMinutes) ? timezoneOffsetMinutes : 0;
    const utcMs = Date.UTC(year, month - 1, day, hour, minute, second, millisecond) + (offset * 60 * 1000);
    const parsed = new Date(utcMs);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const parseFallbackDate = (value) => {
    if (!value) return null;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const buildDateRange = ({ startDate, endDate, timezoneOffsetMinutes }) => {
    if (!startDate || !endDate) return null;
    const start = parseLocalDateTime(startDate, { timezoneOffsetMinutes }) || parseFallbackDate(startDate);
    const end = parseLocalDateTime(endDate, { timezoneOffsetMinutes, endOfDayIfNoTime: true }) || parseFallbackDate(endDate);
    if (!start || !end) return null;
    return { $gte: start, $lte: end };
};

const HOURS_IN_DAY = 24;
const DEFAULT_DAYS = 7;

// Build the base pipeline stages that all aggregations share
function getBasePipelineStages(dateFilter) {
    return [
        { $match: dateFilter },
        // Lookup interactions
        {
            $lookup: {
                from: 'interactions',
                localField: 'interactions',
                foreignField: '_id',
                as: 'interactions'
            }
        },
        { $unwind: '$interactions' },
        // Lookup context (minimal fields needed)
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
                'interactions.context': { $arrayElemAt: ['$ctx', 0] }
            }
        },
        // Project early to reduce memory - only fields needed for metrics
        {
            $project: {
                chatId: 1,
                searchProvider: 1,
                pageLanguage: '$interactions.context.pageLanguage',
                department: '$interactions.context.department',
                contextInputTokens: { $ifNull: ['$interactions.context.inputTokens', 0] },
                contextOutputTokens: { $ifNull: ['$interactions.context.outputTokens', 0] },
                // We need answer lookup for tokens and answerType
                answerId: '$interactions.answer',
                expertFeedbackId: '$interactions.expertFeedback',
                publicFeedbackId: '$interactions.publicFeedback',
                autoEvalId: '$interactions.autoEval'
            }
        }
    ];
}

// Pipeline for overall stats (tokens, questions count)
function buildOverallStatsPipeline(dateFilter) {
    const stages = getBasePipelineStages(dateFilter);

    // Lookup answer for tokens and answerType
    stages.push({
        $lookup: {
            from: 'answers',
            localField: 'answerId',
            foreignField: '_id',
            as: 'answer'
        }
    });
    stages.push({
        $addFields: {
            answer: { $arrayElemAt: ['$answer', 0] }
        }
    });

    // Project minimal answer fields
    stages.push({
        $project: {
            chatId: 1,
            searchProvider: 1,
            pageLanguage: 1,
            department: 1,
            inputTokens: {
                $add: [
                    '$contextInputTokens',
                    { $ifNull: ['$answer.inputTokens', 0] }
                ]
            },
            outputTokens: {
                $add: [
                    '$contextOutputTokens',
                    { $ifNull: ['$answer.outputTokens', 0] }
                ]
            },
            answerType: { $ifNull: ['$answer.answerType', 'normal'] }
        }
    });

    // Aggregate
    stages.push({
        $group: {
            _id: null,
            totalQuestions: { $sum: 1 },
            totalQuestionsEn: { $sum: { $cond: [{ $eq: ['$pageLanguage', 'en'] }, 1, 0] } },
            totalQuestionsFr: { $sum: { $cond: [{ $eq: ['$pageLanguage', 'fr'] }, 1, 0] } },
            totalInputTokens: { $sum: '$inputTokens' },
            totalInputTokensEn: { $sum: { $cond: [{ $eq: ['$pageLanguage', 'en'] }, '$inputTokens', 0] } },
            totalInputTokensFr: { $sum: { $cond: [{ $eq: ['$pageLanguage', 'fr'] }, '$inputTokens', 0] } },
            totalOutputTokens: { $sum: '$outputTokens' },
            totalOutputTokensEn: { $sum: { $cond: [{ $eq: ['$pageLanguage', 'en'] }, '$outputTokens', 0] } },
            totalOutputTokensFr: { $sum: { $cond: [{ $eq: ['$pageLanguage', 'fr'] }, '$outputTokens', 0] } },
            totalGoogleSearches: { $sum: { $cond: [{ $eq: ['$searchProvider', 'google'] }, 1, 0] } },
            // Answer types
            normalCount: { $sum: { $cond: [{ $eq: ['$answerType', 'normal'] }, 1, 0] } },
            normalCountEn: { $sum: { $cond: [{ $and: [{ $eq: ['$answerType', 'normal'] }, { $eq: ['$pageLanguage', 'en'] }] }, 1, 0] } },
            normalCountFr: { $sum: { $cond: [{ $and: [{ $eq: ['$answerType', 'normal'] }, { $eq: ['$pageLanguage', 'fr'] }] }, 1, 0] } },
            clarifyingCount: { $sum: { $cond: [{ $eq: ['$answerType', 'clarifying-question'] }, 1, 0] } },
            clarifyingCountEn: { $sum: { $cond: [{ $and: [{ $eq: ['$answerType', 'clarifying-question'] }, { $eq: ['$pageLanguage', 'en'] }] }, 1, 0] } },
            clarifyingCountFr: { $sum: { $cond: [{ $and: [{ $eq: ['$answerType', 'clarifying-question'] }, { $eq: ['$pageLanguage', 'fr'] }] }, 1, 0] } },
            ptMuniCount: { $sum: { $cond: [{ $eq: ['$answerType', 'pt-muni'] }, 1, 0] } },
            ptMuniCountEn: { $sum: { $cond: [{ $and: [{ $eq: ['$answerType', 'pt-muni'] }, { $eq: ['$pageLanguage', 'en'] }] }, 1, 0] } },
            ptMuniCountFr: { $sum: { $cond: [{ $and: [{ $eq: ['$answerType', 'pt-muni'] }, { $eq: ['$pageLanguage', 'fr'] }] }, 1, 0] } },
            notGcCount: { $sum: { $cond: [{ $eq: ['$answerType', 'not-gc'] }, 1, 0] } },
            notGcCountEn: { $sum: { $cond: [{ $and: [{ $eq: ['$answerType', 'not-gc'] }, { $eq: ['$pageLanguage', 'en'] }] }, 1, 0] } },
            notGcCountFr: { $sum: { $cond: [{ $and: [{ $eq: ['$answerType', 'not-gc'] }, { $eq: ['$pageLanguage', 'fr'] }] }, 1, 0] } }
        }
    });

    return stages;
}

// Pipeline for session stats (count by question count)
function buildSessionStatsPipeline(dateFilter) {
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
        // Lookup first interaction's context for pageLanguage
        {
            $lookup: {
                from: 'contexts',
                localField: 'interactions.context',
                foreignField: '_id',
                as: 'contexts'
            }
        },
        {
            $project: {
                chatId: 1,
                questionCount: { $size: '$interactions' },
                pageLanguage: { $arrayElemAt: ['$contexts.pageLanguage', 0] }
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

// Pipeline for expert feedback stats
function buildExpertFeedbackPipeline(dateFilter) {
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
        // Lookup context for pageLanguage
        {
            $lookup: {
                from: 'contexts',
                localField: 'interactions.context',
                foreignField: '_id',
                as: 'ctx'
            }
        },
        // Lookup expert feedback
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
                pageLanguage: { $arrayElemAt: ['$ctx.pageLanguage', 0] },
                expertFeedback: { $arrayElemAt: ['$ef', 0] }
            }
        },
        // Filter to only interactions with expert feedback
        { $match: { expertFeedback: { $ne: null } } },
        // Compute category using existing logic
        {
            $addFields: {
                category: getPartnerEvalAggregationExpression('$expertFeedback')
            }
        },
        {
            $group: {
                _id: null,
                total: { $sum: 1 },
                totalEn: { $sum: { $cond: [{ $eq: ['$pageLanguage', 'en'] }, 1, 0] } },
                totalFr: { $sum: { $cond: [{ $eq: ['$pageLanguage', 'fr'] }, 1, 0] } },
                correct: { $sum: { $cond: [{ $eq: ['$category', 'correct'] }, 1, 0] } },
                correctEn: { $sum: { $cond: [{ $and: [{ $eq: ['$category', 'correct'] }, { $eq: ['$pageLanguage', 'en'] }] }, 1, 0] } },
                correctFr: { $sum: { $cond: [{ $and: [{ $eq: ['$category', 'correct'] }, { $eq: ['$pageLanguage', 'fr'] }] }, 1, 0] } },
                needsImprovement: { $sum: { $cond: [{ $eq: ['$category', 'needsImprovement'] }, 1, 0] } },
                needsImprovementEn: { $sum: { $cond: [{ $and: [{ $eq: ['$category', 'needsImprovement'] }, { $eq: ['$pageLanguage', 'en'] }] }, 1, 0] } },
                needsImprovementFr: { $sum: { $cond: [{ $and: [{ $eq: ['$category', 'needsImprovement'] }, { $eq: ['$pageLanguage', 'fr'] }] }, 1, 0] } },
                hasError: { $sum: { $cond: [{ $eq: ['$category', 'hasError'] }, 1, 0] } },
                hasErrorEn: { $sum: { $cond: [{ $and: [{ $eq: ['$category', 'hasError'] }, { $eq: ['$pageLanguage', 'en'] }] }, 1, 0] } },
                hasErrorFr: { $sum: { $cond: [{ $and: [{ $eq: ['$category', 'hasError'] }, { $eq: ['$pageLanguage', 'fr'] }] }, 1, 0] } },
                hasCitationError: { $sum: { $cond: [{ $eq: ['$category', 'hasCitationError'] }, 1, 0] } },
                hasCitationErrorEn: { $sum: { $cond: [{ $and: [{ $eq: ['$category', 'hasCitationError'] }, { $eq: ['$pageLanguage', 'en'] }] }, 1, 0] } },
                hasCitationErrorFr: { $sum: { $cond: [{ $and: [{ $eq: ['$category', 'hasCitationError'] }, { $eq: ['$pageLanguage', 'fr'] }] }, 1, 0] } },
                harmful: { $sum: { $cond: [{ $eq: ['$category', 'harmful'] }, 1, 0] } },
                harmfulEn: { $sum: { $cond: [{ $and: [{ $eq: ['$category', 'harmful'] }, { $eq: ['$pageLanguage', 'en'] }] }, 1, 0] } },
                harmfulFr: { $sum: { $cond: [{ $and: [{ $eq: ['$category', 'harmful'] }, { $eq: ['$pageLanguage', 'fr'] }] }, 1, 0] } }
            }
        }
    ];
    return stages;
}

// Pipeline for AI eval stats
function buildAiEvalPipeline(dateFilter) {
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
        // Lookup context for pageLanguage
        {
            $lookup: {
                from: 'contexts',
                localField: 'interactions.context',
                foreignField: '_id',
                as: 'ctx'
            }
        },
        // Lookup autoEval
        {
            $lookup: {
                from: 'evals',
                localField: 'interactions.autoEval',
                foreignField: '_id',
                as: 'autoEval'
            }
        },
        {
            $addFields: {
                pageLanguage: { $arrayElemAt: ['$ctx.pageLanguage', 0] },
                autoEval: { $arrayElemAt: ['$autoEval', 0] }
            }
        },
        // Filter to only interactions with autoEval
        { $match: { autoEval: { $ne: null } } },
        // Lookup nested expertFeedback from eval
        {
            $lookup: {
                from: 'expertfeedbacks',
                localField: 'autoEval.expertFeedback',
                foreignField: '_id',
                as: 'autoEvalFeedback'
            }
        },
        {
            $addFields: {
                'autoEval.expertFeedback': { $arrayElemAt: ['$autoEvalFeedback', 0] }
            }
        },
        // Filter to only those with expertFeedback
        { $match: { 'autoEval.expertFeedback': { $ne: null } } },
        // Compute category
        {
            $addFields: {
                category: getAiEvalAggregationExpression('$autoEval.expertFeedback')
            }
        },
        {
            $group: {
                _id: null,
                total: { $sum: 1 },
                totalEn: { $sum: { $cond: [{ $eq: ['$pageLanguage', 'en'] }, 1, 0] } },
                totalFr: { $sum: { $cond: [{ $eq: ['$pageLanguage', 'fr'] }, 1, 0] } },
                correct: { $sum: { $cond: [{ $eq: ['$category', 'correct'] }, 1, 0] } },
                correctEn: { $sum: { $cond: [{ $and: [{ $eq: ['$category', 'correct'] }, { $eq: ['$pageLanguage', 'en'] }] }, 1, 0] } },
                correctFr: { $sum: { $cond: [{ $and: [{ $eq: ['$category', 'correct'] }, { $eq: ['$pageLanguage', 'fr'] }] }, 1, 0] } },
                needsImprovement: { $sum: { $cond: [{ $eq: ['$category', 'needsImprovement'] }, 1, 0] } },
                needsImprovementEn: { $sum: { $cond: [{ $and: [{ $eq: ['$category', 'needsImprovement'] }, { $eq: ['$pageLanguage', 'en'] }] }, 1, 0] } },
                needsImprovementFr: { $sum: { $cond: [{ $and: [{ $eq: ['$category', 'needsImprovement'] }, { $eq: ['$pageLanguage', 'fr'] }] }, 1, 0] } },
                hasError: { $sum: { $cond: [{ $eq: ['$category', 'hasError'] }, 1, 0] } },
                hasErrorEn: { $sum: { $cond: [{ $and: [{ $eq: ['$category', 'hasError'] }, { $eq: ['$pageLanguage', 'en'] }] }, 1, 0] } },
                hasErrorFr: { $sum: { $cond: [{ $and: [{ $eq: ['$category', 'hasError'] }, { $eq: ['$pageLanguage', 'fr'] }] }, 1, 0] } },
                hasCitationError: { $sum: { $cond: [{ $eq: ['$category', 'hasCitationError'] }, 1, 0] } },
                hasCitationErrorEn: { $sum: { $cond: [{ $and: [{ $eq: ['$category', 'hasCitationError'] }, { $eq: ['$pageLanguage', 'en'] }] }, 1, 0] } },
                hasCitationErrorFr: { $sum: { $cond: [{ $and: [{ $eq: ['$category', 'hasCitationError'] }, { $eq: ['$pageLanguage', 'fr'] }] }, 1, 0] } },
                harmful: { $sum: { $cond: [{ $eq: ['$category', 'harmful'] }, 1, 0] } },
                harmfulEn: { $sum: { $cond: [{ $and: [{ $eq: ['$category', 'harmful'] }, { $eq: ['$pageLanguage', 'en'] }] }, 1, 0] } },
                harmfulFr: { $sum: { $cond: [{ $and: [{ $eq: ['$category', 'harmful'] }, { $eq: ['$pageLanguage', 'fr'] }] }, 1, 0] } }
            }
        }
    ];
    return stages;
}

// Pipeline for public feedback stats
function buildPublicFeedbackPipeline(dateFilter) {
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
        // Lookup context for pageLanguage
        {
            $lookup: {
                from: 'contexts',
                localField: 'interactions.context',
                foreignField: '_id',
                as: 'ctx'
            }
        },
        // Lookup public feedback
        {
            $lookup: {
                from: 'publicfeedbacks',
                localField: 'interactions.publicFeedback',
                foreignField: '_id',
                as: 'pf'
            }
        },
        {
            $addFields: {
                pageLanguage: { $arrayElemAt: ['$ctx.pageLanguage', 0] },
                publicFeedback: { $arrayElemAt: ['$pf', 0] }
            }
        },
        // Filter to only interactions with public feedback
        { $match: { publicFeedback: { $ne: null } } },
        {
            $group: {
                _id: null,
                totalWithFeedback: { $sum: 1 },
                yesCount: { $sum: { $cond: [{ $eq: ['$publicFeedback.feedback', 'yes'] }, 1, 0] } },
                noCount: { $sum: { $cond: [{ $eq: ['$publicFeedback.feedback', 'no'] }, 1, 0] } },
                yesCountEn: { $sum: { $cond: [{ $and: [{ $eq: ['$publicFeedback.feedback', 'yes'] }, { $eq: ['$pageLanguage', 'en'] }] }, 1, 0] } },
                yesCountFr: { $sum: { $cond: [{ $and: [{ $eq: ['$publicFeedback.feedback', 'yes'] }, { $eq: ['$pageLanguage', 'fr'] }] }, 1, 0] } },
                noCountEn: { $sum: { $cond: [{ $and: [{ $eq: ['$publicFeedback.feedback', 'no'] }, { $eq: ['$pageLanguage', 'en'] }] }, 1, 0] } },
                noCountFr: { $sum: { $cond: [{ $and: [{ $eq: ['$publicFeedback.feedback', 'no'] }, { $eq: ['$pageLanguage', 'fr'] }] }, 1, 0] } }
            }
        }
    ];
    return stages;
}

// Pipeline for department stats
function buildDepartmentPipeline(dateFilter) {
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
        // Lookup context for department
        {
            $lookup: {
                from: 'contexts',
                localField: 'interactions.context',
                foreignField: '_id',
                as: 'ctx'
            }
        },
        // Lookup expert feedback
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
                department: { $ifNull: [{ $arrayElemAt: ['$ctx.department', 0] }, 'Unknown'] },
                expertFeedback: { $arrayElemAt: ['$ef', 0] }
            }
        },
        // Compute category for expert feedback
        {
            $addFields: {
                hasExpertFeedback: { $cond: [{ $ne: ['$expertFeedback', null] }, 1, 0] },
                category: getPartnerEvalAggregationExpression('$expertFeedback')
            }
        },
        {
            $group: {
                _id: '$department',
                total: { $sum: 1 },
                expertScoredTotal: { $sum: '$hasExpertFeedback' },
                expertScoredCorrect: { $sum: { $cond: [{ $eq: ['$category', 'correct'] }, 1, 0] } },
                expertScoredNeedsImprovement: { $sum: { $cond: [{ $eq: ['$category', 'needsImprovement'] }, 1, 0] } },
                expertScoredHasError: { $sum: { $cond: [{ $eq: ['$category', 'hasError'] }, 1, 0] } }
            }
        },
        { $sort: { total: -1 } }
    ];
    return stages;
}

async function metricsDashboardHandler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ message: 'Method not allowed' });
    }

    try {
        await dbConnect();
        const { startDate, endDate, timezoneOffsetMinutes } = req.query;

        // Build date filter
        let dateFilter = {};
        if (startDate && endDate) {
            const parsedRange = buildDateRange({
                startDate,
                endDate,
                timezoneOffsetMinutes: Number.isFinite(parseInt(timezoneOffsetMinutes, 10))
                    ? parseInt(timezoneOffsetMinutes, 10)
                    : undefined
            });
            if (!parsedRange) {
                return res.status(400).json({ error: 'startDate and endDate must be valid dates' });
            }
            dateFilter.createdAt = parsedRange;
        } else {
            const now = new Date();
            const start = new Date(now.getTime() - DEFAULT_DAYS * HOURS_IN_DAY * 60 * 60 * 1000);
            dateFilter.createdAt = { $gte: start, $lte: now };
        }

        // Execute all aggregations in parallel (DocumentDB-compatible)
        const [
            overallResult,
            sessionResult,
            expertResult,
            aiResult,
            publicFeedbackResult,
            departmentResult
        ] = await Promise.all([
            Chat.aggregate(buildOverallStatsPipeline(dateFilter)),
            Chat.aggregate(buildSessionStatsPipeline(dateFilter)),
            Chat.aggregate(buildExpertFeedbackPipeline(dateFilter)),
            Chat.aggregate(buildAiEvalPipeline(dateFilter)),
            Chat.aggregate(buildPublicFeedbackPipeline(dateFilter)),
            Chat.aggregate(buildDepartmentPipeline(dateFilter))
        ]);

        // Extract results (default to empty object if no results)
        const overall = overallResult[0] || {};
        const session = sessionResult[0] || {};
        const expert = expertResult[0] || {};
        const ai = aiResult[0] || {};
        const publicFb = publicFeedbackResult[0] || {};

        // Build response in the format expected by the frontend
        const metrics = {
            totalSessions: session.totalConversations || 0,
            totalQuestions: overall.totalQuestions || 0,
            totalQuestionsEn: overall.totalQuestionsEn || 0,
            totalQuestionsFr: overall.totalQuestionsFr || 0,
            totalConversations: session.totalConversations || 0,
            totalConversationsEn: session.totalConversationsEn || 0,
            totalConversationsFr: session.totalConversationsFr || 0,
            totalGoogleSearches: overall.totalGoogleSearches || 0,
            totalInputTokens: overall.totalInputTokens || 0,
            totalInputTokensEn: overall.totalInputTokensEn || 0,
            totalInputTokensFr: overall.totalInputTokensFr || 0,
            totalOutputTokens: overall.totalOutputTokens || 0,
            totalOutputTokensEn: overall.totalOutputTokensEn || 0,
            totalOutputTokensFr: overall.totalOutputTokensFr || 0,
            sessionsByQuestionCount: {
                singleQuestion: {
                    total: session.singleQuestion || 0,
                    en: session.singleQuestionEn || 0,
                    fr: session.singleQuestionFr || 0
                },
                twoQuestions: {
                    total: session.twoQuestions || 0,
                    en: session.twoQuestionsEn || 0,
                    fr: session.twoQuestionsFr || 0
                },
                threeQuestions: {
                    total: session.threeQuestions || 0,
                    en: session.threeQuestionsEn || 0,
                    fr: session.threeQuestionsFr || 0
                }
            },
            answerTypes: {
                normal: {
                    total: overall.normalCount || 0,
                    en: overall.normalCountEn || 0,
                    fr: overall.normalCountFr || 0
                },
                'clarifying-question': {
                    total: overall.clarifyingCount || 0,
                    en: overall.clarifyingCountEn || 0,
                    fr: overall.clarifyingCountFr || 0
                },
                'pt-muni': {
                    total: overall.ptMuniCount || 0,
                    en: overall.ptMuniCountEn || 0,
                    fr: overall.ptMuniCountFr || 0
                },
                'not-gc': {
                    total: overall.notGcCount || 0,
                    en: overall.notGcCountEn || 0,
                    fr: overall.notGcCountFr || 0
                }
            },
            expertScored: {
                total: { total: expert.total || 0, en: expert.totalEn || 0, fr: expert.totalFr || 0 },
                correct: { total: expert.correct || 0, en: expert.correctEn || 0, fr: expert.correctFr || 0 },
                needsImprovement: { total: expert.needsImprovement || 0, en: expert.needsImprovementEn || 0, fr: expert.needsImprovementFr || 0 },
                hasError: { total: expert.hasError || 0, en: expert.hasErrorEn || 0, fr: expert.hasErrorFr || 0 },
                hasCitationError: { total: expert.hasCitationError || 0, en: expert.hasCitationErrorEn || 0, fr: expert.hasCitationErrorFr || 0 },
                harmful: { total: expert.harmful || 0, en: expert.harmfulEn || 0, fr: expert.harmfulFr || 0 }
            },
            aiScored: {
                total: { total: ai.total || 0, en: ai.totalEn || 0, fr: ai.totalFr || 0 },
                correct: { total: ai.correct || 0, en: ai.correctEn || 0, fr: ai.correctFr || 0 },
                needsImprovement: { total: ai.needsImprovement || 0, en: ai.needsImprovementEn || 0, fr: ai.needsImprovementFr || 0 },
                hasError: { total: ai.hasError || 0, en: ai.hasErrorEn || 0, fr: ai.hasErrorFr || 0 },
                hasCitationError: { total: ai.hasCitationError || 0, en: ai.hasCitationErrorEn || 0, fr: ai.hasCitationErrorFr || 0 },
                harmful: { total: ai.harmful || 0, en: ai.harmfulEn || 0, fr: ai.harmfulFr || 0 }
            },
            userScored: {
                total: { total: 0, en: 0, fr: 0 },
                helpful: { total: 0, en: 0, fr: 0 },
                unhelpful: { total: 0, en: 0, fr: 0 }
            },
            publicFeedbackTotals: {
                totalQuestionsWithFeedback: publicFb.totalWithFeedback || 0,
                yes: publicFb.yesCount || 0,
                no: publicFb.noCount || 0,
                enYes: publicFb.yesCountEn || 0,
                enNo: publicFb.noCountEn || 0,
                frYes: publicFb.yesCountFr || 0,
                frNo: publicFb.noCountFr || 0
            },
            publicFeedbackReasons: { yes: {}, no: {} },
            publicFeedbackScores: {},
            publicFeedbackReasonsByLang: { en: {}, fr: {} },
            byDepartment: {}
        };

        // Build department map
        departmentResult.forEach(dept => {
            metrics.byDepartment[dept._id] = {
                total: dept.total,
                expertScored: {
                    total: dept.expertScoredTotal,
                    correct: dept.expertScoredCorrect,
                    needsImprovement: dept.expertScoredNeedsImprovement,
                    hasError: dept.expertScoredHasError
                },
                userScored: {
                    total: 0,
                    helpful: 0,
                    unhelpful: 0
                }
            };
        });

        return res.status(200).json({ success: true, metrics });
    } catch (error) {
        console.error('Error in metrics dashboard:', error);
        return res.status(500).json({ error: 'Failed to fetch metrics', details: error.message });
    }
}

export default function handler(req, res) {
    return withProtection(metricsDashboardHandler, authMiddleware, adminMiddleware)(req, res);
}
