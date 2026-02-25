import { getChatFilterConditions } from '../util/chat-filters.js';

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

export function parseRequestFilters(req) {
    const { startDate, endDate, timezoneOffsetMinutes } = req.query;

    // 1. Date Filter
    let dateFilter = {};
    if (startDate && endDate) {
        const parsedRange = buildDateRange({
            startDate,
            endDate,
            timezoneOffsetMinutes: Number.isFinite(parseInt(timezoneOffsetMinutes, 10))
                ? parseInt(timezoneOffsetMinutes, 10)
                : undefined
        });
        if (parsedRange) {
            dateFilter.createdAt = parsedRange;
        }
    } else {
        const now = new Date();
        const start = new Date(now.getTime() - DEFAULT_DAYS * HOURS_IN_DAY * 60 * 60 * 1000);
        dateFilter.createdAt = { $gte: start, $lte: now };
    }

    // 2. Base Filters (exclude computed fields and context-based fields)
    const { answerType, partnerEval, aiEval, userType, department, urlEn, urlFr } = req.query;
    const interactionFilters = { userType, urlEn, urlFr }; // department is context-based, handled separately
    const extraFilterConditions = getChatFilterConditions(interactionFilters);

    // 2b. Department filter (applied after context lookup, built inline)
    const departmentFilter = [];
    if (department) {
        const escaped = department.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        departmentFilter.push({ department: { $regex: escaped, $options: 'i' } });
    }

    // 3. Computed Filters (Built manually)

    // answerType
    let answerTypeFilter = null;
    if (answerType && answerType !== 'all') {
        const types = answerType.split(',').map(t => t.trim()).filter(Boolean);
        if (types.length === 1) {
            answerTypeFilter = { answerType: types[0] };
        } else if (types.length > 1) {
            answerTypeFilter = { answerType: { $in: types } };
        }
    }

    // partnerEval (category)
    let partnerEvalFilter = null;
    if (partnerEval && partnerEval !== 'all') {
        const categories = partnerEval.split(',').map(c => c.trim()).filter(Boolean);
        if (categories.length === 1) {
            partnerEvalFilter = { category: categories[0] };
        } else if (categories.length > 1) {
            partnerEvalFilter = { category: { $in: categories } };
        }
    }

    // aiEval (category)
    let aiEvalFilter = null;
    if (aiEval && aiEval !== 'all') {
        const categories = aiEval.split(',').map(c => c.trim()).filter(Boolean);
        if (categories.length === 1) {
            aiEvalFilter = { category: categories[0] };
        } else if (categories.length > 1) {
            aiEvalFilter = { category: { $in: categories } };
        }
    }

    return {
        dateFilter,
        extraFilterConditions,
        departmentFilter,
        answerTypeFilter,
        partnerEvalFilter,
        aiEvalFilter
    };
}

/**
 * Shared base pipeline stages for metrics aggregations.
 * Performs the common Chat → Interactions → Context lookup chain.
 * 
 * @param {Object} dateFilter - MongoDB date filter for createdAt
 * @param {Array} extraFilters - Additional filter conditions to apply after unwind
 * @param {Object} options - Additional options
 * @param {boolean} options.unwindInteractions - Whether to unwind interactions (default: true)
 * @returns {Array} MongoDB aggregation pipeline stages
 */
export function getBaseInteractionPipeline(dateFilter, extraFilters = [], options = {}) {
    const { unwindInteractions = true } = options;

    const stages = [
        { $match: dateFilter },
        {
            $lookup: {
                from: 'interactions',
                localField: 'interactions',
                foreignField: '_id',
                as: 'interactions'
            }
        }
    ];

    if (unwindInteractions) {
        stages.push({ $unwind: '$interactions' });

        // Apply extra filters after unwind (since they filter on interactions.x)
        if (extraFilters.length > 0) {
            stages.push({ $match: { $and: extraFilters } });
        }
    }

    // Lookup context
    stages.push(
        {
            $lookup: {
                from: 'contexts',
                localField: unwindInteractions ? 'interactions.context' : 'interactions.context',
                foreignField: '_id',
                as: 'ctx'
            }
        },
        // Note: pageLanguage lives on the Chat document root, not on Context.
        // No $addFields needed — it flows through from the Chat collection.
    );

    return stages;
}

/**
 * Add answer lookup stages to a pipeline
 * @param {Array} pipeline - Existing pipeline stages
 * @returns {Array} Pipeline with answer lookup added
 */
export function addAnswerLookup(pipeline) {
    return [
        ...pipeline,
        {
            $lookup: {
                from: 'answers',
                localField: 'interactions.answer',
                foreignField: '_id',
                as: 'answer'
            }
        },
        {
            $addFields: {
                answer: { $arrayElemAt: ['$answer', 0] }
            }
        }
    ];
}

/**
 * Add expert feedback lookup stages to a pipeline
 * @param {Array} pipeline - Existing pipeline stages
 * @returns {Array} Pipeline with expert feedback lookup added
 */
export function addExpertFeedbackLookup(pipeline) {
    return [
        ...pipeline,
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
                expertFeedback: { $arrayElemAt: ['$ef', 0] }
            }
        }
    ];
}

/**
 * Add public feedback lookup stages to a pipeline
 * @param {Array} pipeline - Existing pipeline stages
 * @returns {Array} Pipeline with public feedback lookup added
 */
export function addPublicFeedbackLookup(pipeline) {
    return [
        ...pipeline,
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
                publicFeedback: { $arrayElemAt: ['$pf', 0] }
            }
        }
    ];
}

/**
 * Add AI eval (autoEval) lookup stages to a pipeline
 * @param {Array} pipeline - Existing pipeline stages
 * @returns {Array} Pipeline with AI eval lookup added
 */
export function addAutoEvalLookup(pipeline) {
    return [
        ...pipeline,
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
                autoEval: { $arrayElemAt: ['$autoEval', 0] }
            }
        },
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
        }
    ];
}

/**
 * Execute an aggregation with retry logic for DocumentDB low memory errors.
 * Retries up to maxRetries times with exponential backoff.
 * 
 * @param {Function} aggregateFn - Function that returns the aggregate query (e.g., () => Model.aggregate(pipeline).allowDiskUse(true))
 * @param {Object} options - Retry options
 * @param {number} options.maxRetries - Maximum number of retries (default: 2)
 * @param {number} options.baseDelayMs - Base delay in milliseconds (default: 2000)
 * @returns {Promise} - Aggregation result
 */
export async function executeWithRetry(aggregateFn, options = {}) {
    const { maxRetries = 2, baseDelayMs = 2000 } = options;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await aggregateFn();
        } catch (error) {
            // Check if it's a low memory error (code 39)
            const isLowMemory = error.code === 39 ||
                error.errorResponse?.code === 39 ||
                (error.message && error.message.includes('low available memory'));

            if (isLowMemory && attempt < maxRetries) {
                const delayMs = baseDelayMs * Math.pow(2, attempt); // Exponential backoff
                console.warn(`DocumentDB low memory error, retrying in ${delayMs}ms (attempt ${attempt + 1}/${maxRetries})...`);
                await new Promise(resolve => setTimeout(resolve, delayMs));
                continue;
            }
            throw error;
        }
    }
}
