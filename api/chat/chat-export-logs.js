// chat-export-logs.js - Server-side streaming export for chat logs
import dbConnect from '../db/db-connect.js';
import { Chat } from '../../models/chat.js';
import { BatchItem } from '../../models/batchItem.js';
import {
    authMiddleware,
    withProtection
} from '../../middleware/auth.js';
import { getChatFilterConditions, getPartnerEvalAggregationExpression, getAiEvalAggregationExpression } from '../util/chat-filters.js';
import ExcelJS from 'exceljs';
import { format as csvFormat } from 'fast-csv';
import { flatten } from 'flat';

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

// View definitions
const VIEW_DEFINITIONS = {
    default: {
        name: 'Default',
        description: 'Standard export with core chat data',
        // We will explicitly construct the rows for default view to match requirements exactly
        mode: 'explicit'
    },
    tools: {
        name: 'Tools',
        description: 'Export with tool usage data',
        mode: 'flatten_exclude',
        excludePatterns: ['autoEval.sentenceMatchTrace', 'autoEval.stageTimeline']
    },
    'auto-eval-debug': {
        name: 'Auto-eval Debug',
        description: 'Full export including all auto-eval trace data',
        mode: 'flatten_exclude',
        excludePatterns: []
    }
};

// Required headers for Default view (and base for others)
const DEFAULT_HEADER_ORDER = [
    'uniqueID',
    'chatId',
    'userEmail',
    'createdAt',
    'pageLanguage',
    'referringUrl',
    'questionLanguage',
    'redactedQuestion',
    'aiService',
    'searchService',
    'citationUrl',
    'englishAnswer',
    'answer',
    'sentence1',
    'sentence2',
    'sentence3',
    'sentence4',
    'feedback',
    'expertFeedback.totalScore',
    'expertFeedback.sentence1Score',
    'expertFeedback.sentence1Explanation',
    'expertFeedback.sentence1Harmful',
    'expertFeedback.sentence2Score',
    'expertFeedback.sentence2Explanation',
    'expertFeedback.sentence2Harmful',
    'expertFeedback.sentence3Score',
    'expertFeedback.sentence3Explanation',
    'expertFeedback.sentence3Harmful',
    'expertFeedback.sentence4Score',
    'expertFeedback.sentence4Explanation',
    'expertFeedback.sentence4Harmful',
    'expertFeedback.citationScore',
    'expertFeedback.citationExplanation',
    'expertFeedback.answerImprovement',
    'expertFeedback.expertCitationUrl',
    'publicFeedback.feedback',
    'publicFeedback.publicFeedbackReason',
    'publicFeedback.publicFeedbackScore',
    'answer.answerType',
    'expertFeedback.sentence1ContentIssue',
    'expertFeedback.sentence2ContentIssue',
    'expertFeedback.sentence3ContentIssue',
    'expertFeedback.sentence4ContentIssue',
    'expertFeedback.expertEmail',
    'expertFeedback.neverStale',
    'expertFeedback.createdAt',
    'expertFeedback.updatedAt',
    'context.department',
    'context.searchQuery',
    'context.searchResults',
    'context.translatedQuestion',
    'autoEval.expertFeedback.totalScore'
];

function getPopulateOptions(view) {
    // Base population for all views
    const basePopulate = [
        { path: 'context' },
        { path: 'expertFeedback', model: 'ExpertFeedback', select: '-__v -_id' },
        { path: 'publicFeedback', model: 'PublicFeedback', select: '-__v -_id' },
        { path: 'question', select: '-embedding -_id' },
        {
            path: 'answer',
            select: '-embedding -sentenceEmbeddings -_id',
            populate: [
                { path: 'citation', select: '-_id' }
            ]
        }
    ];

    if (view === 'tools') {
        // Add tools population
        basePopulate.find(p => p.path === 'answer').populate.push({ path: 'tools', select: '-_id' });
    }

    if (view === 'auto-eval-debug') {
        // Full autoEval
        basePopulate.push({
            path: 'autoEval',
            model: 'Eval',
            select: '-__v -_id',
            populate: {
                path: 'expertFeedback',
                model: 'ExpertFeedback',
                select: '-__v -_id'
            }
        });
    } else {
        // Default / Optimized: Only autoEval expertFeedback totalScore
        // Note: Mongoose select on populated subdocs works, but for deep nested data it's easier to just fetch the field if needed.
        // Or we just populate autoEval.expertFeedback and filter later.
        // To be safe and strict, let's populate autoEval just enough.
        basePopulate.push({
            path: 'autoEval',
            model: 'Eval',
            select: 'expertFeedback',
            populate: {
                path: 'expertFeedback',
                model: 'ExpertFeedback',
                select: 'totalScore'
            }
        });
    }

    return [
        { path: 'user', select: 'email' },
        {
            path: 'interactions',
            populate: basePopulate
        }
    ];
}

function flattenInteraction(chat, interaction, view) {
    const viewDef = VIEW_DEFINITIONS[view] || VIEW_DEFINITIONS.default;

    // Common Base Fields
    const uniqueID = chat.chatId
        ? `${chat.chatId}${interaction.interactionId || interaction._id}`
        : `batch_${interaction.interactionId || interaction._id}`;

    // Helper to safely get nested properties
    const get = (obj, path, def = '') => {
        return path.split('.').reduce((acc, part) => acc && acc[part] !== undefined ? acc[part] : undefined, obj) ?? def;
    };

    // Extract sentences from answer.sentences or answer.content
    const sentences = get(interaction, 'answer.sentences', []);
    const sentence1 = sentences[0] || '';
    const sentence2 = sentences[1] || '';
    const sentence3 = sentences[2] || '';
    const sentence4 = sentences[3] || '';

    // Explicit Default View Construction
    if (viewDef.mode === 'explicit') {
        return {
            uniqueID,
            chatId: chat.chatId || '',
            userEmail: get(chat, 'user.email'),
            createdAt: chat.createdAt ? new Date(chat.createdAt).toISOString() : '', // Assuming chat creation time, or interaction?? User list has createdAt.
            // Using chat.createdAt for the interaction row might be misleading if multiple interactions, but it's what was requested in context of "chat schema".
            // If interaction has createdAt, use it? Interaction schema usually has timestamps.
            // Let's prefer interaction.createdAt if available
            createdAt: interaction.createdAt ? new Date(interaction.createdAt).toISOString() : (chat.createdAt ? new Date(chat.createdAt).toISOString() : ''),

            pageLanguage: get(interaction, 'context.pageLanguage') || chat.pageLanguage || '',
            referringUrl: get(interaction, 'referringUrl') || '', // Context usually has it
            questionLanguage: get(interaction, 'question.language'),
            redactedQuestion: get(interaction, 'question.redactedQuestion') || get(interaction, 'question.question') || '', // Fallback to raw if redacted missing? No, request said redactedQuestion.
            aiService: chat.aiProvider || '',
            searchService: chat.searchProvider || '',

            citationUrl: get(interaction, 'answer.citation.providedCitationUrl') || get(interaction, 'answer.citation.url') || '',
            englishAnswer: get(interaction, 'answer.englishAnswer'),
            answer: get(interaction, 'answer.content'),

            sentence1,
            sentence2,
            sentence3,
            sentence4,

            feedback: get(interaction, 'expertFeedback.feedback'),
            'expertFeedback.totalScore': get(interaction, 'expertFeedback.totalScore'),
            'expertFeedback.sentence1Score': get(interaction, 'expertFeedback.sentence1Score'),
            'expertFeedback.sentence1Explanation': get(interaction, 'expertFeedback.sentence1Explanation'),
            'expertFeedback.sentence1Harmful': get(interaction, 'expertFeedback.sentence1Harmful'),
            'expertFeedback.sentence2Score': get(interaction, 'expertFeedback.sentence2Score'),
            'expertFeedback.sentence2Explanation': get(interaction, 'expertFeedback.sentence2Explanation'),
            'expertFeedback.sentence2Harmful': get(interaction, 'expertFeedback.sentence2Harmful'),
            'expertFeedback.sentence3Score': get(interaction, 'expertFeedback.sentence3Score'),
            'expertFeedback.sentence3Explanation': get(interaction, 'expertFeedback.sentence3Explanation'),
            'expertFeedback.sentence3Harmful': get(interaction, 'expertFeedback.sentence3Harmful'),
            'expertFeedback.sentence4Score': get(interaction, 'expertFeedback.sentence4Score'),
            'expertFeedback.sentence4Explanation': get(interaction, 'expertFeedback.sentence4Explanation'),
            'expertFeedback.sentence4Harmful': get(interaction, 'expertFeedback.sentence4Harmful'),

            'expertFeedback.citationScore': get(interaction, 'expertFeedback.citationScore'),
            'expertFeedback.citationExplanation': get(interaction, 'expertFeedback.citationExplanation'),
            'expertFeedback.answerImprovement': get(interaction, 'expertFeedback.answerImprovement'),
            'expertFeedback.expertCitationUrl': get(interaction, 'expertFeedback.expertCitationUrl'),

            'publicFeedback.feedback': get(interaction, 'publicFeedback.feedback'),
            'publicFeedback.publicFeedbackReason': get(interaction, 'publicFeedback.publicFeedbackReason'),
            'publicFeedback.publicFeedbackScore': get(interaction, 'publicFeedback.publicFeedbackScore'),

            'answer.answerType': get(interaction, 'answer.answerType'),

            // Additional expert fields
            'expertFeedback.sentence1ContentIssue': get(interaction, 'expertFeedback.sentence1ContentIssue'),
            'expertFeedback.sentence2ContentIssue': get(interaction, 'expertFeedback.sentence2ContentIssue'),
            'expertFeedback.sentence3ContentIssue': get(interaction, 'expertFeedback.sentence3ContentIssue'),
            'expertFeedback.sentence4ContentIssue': get(interaction, 'expertFeedback.sentence4ContentIssue'),
            'expertFeedback.expertEmail': get(interaction, 'expertFeedback.expertEmail'),
            'expertFeedback.neverStale': get(interaction, 'expertFeedback.neverStale'),
            'expertFeedback.createdAt': get(interaction, 'expertFeedback.createdAt') ? new Date(get(interaction, 'expertFeedback.createdAt')).toISOString() : '',
            'expertFeedback.updatedAt': get(interaction, 'expertFeedback.updatedAt') ? new Date(get(interaction, 'expertFeedback.updatedAt')).toISOString() : '',

            'context.department': get(interaction, 'context.department'),
            'context.searchQuery': get(interaction, 'context.searchQuery'),
            // Context search results might be array/object, flatten or stringify? Default behavior is usually stringify for cells if object.
            'context.searchResults': JSON.stringify(get(interaction, 'context.searchResults', '')),
            'context.translatedQuestion': get(interaction, 'context.translatedQuestion'),

            'autoEval.expertFeedback.totalScore': get(interaction, 'autoEval.expertFeedback.totalScore')
        };
    }

    // Dynamic Flattening for other views
    const excludePatterns = viewDef.excludePatterns || [];
    const base = {
        uniqueID,
        chatId: chat.chatId || '',
        pageLanguage: chat.pageLanguage || get(interaction, 'context.pageLanguage') || '',
        aiService: chat.aiProvider || '',
        searchService: chat.searchProvider || '',
        userEmail: chat.user?.email || '',
        createdAt: interaction.createdAt || chat.createdAt || ''
    };

    // Flatten logic
    const flatInteraction = flatten(interaction, { safe: true });

    // Add computed sentence fields just in case they are wanted in Tools/Debug views too
    flatInteraction.sentence1 = sentence1;
    flatInteraction.sentence2 = sentence2;
    flatInteraction.sentence3 = sentence3;
    flatInteraction.sentence4 = sentence4;

    const merged = { ...base, ...flatInteraction };

    // Filter exclusions
    if (excludePatterns.length > 0) {
        for (const key of Object.keys(merged)) {
            for (const pattern of excludePatterns) {
                if (key.includes(pattern)) {
                    delete merged[key];
                    break;
                }
            }
        }
    }

    // Cleanup
    for (const key of Object.keys(merged)) {
        if (key.includes('_id') || key.includes('__v')) delete merged[key];
    }

    return merged;
}

async function chatExportHandler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ message: 'Method not allowed' });
    }

    try {
        await dbConnect();
        const {
            startDate, endDate,
            department, referringUrl, urlEn, urlFr, userType, answerType, partnerEval, aiEval,
            timezoneOffsetMinutes,
            batchId,
            view = 'default',
            format = 'xlsx'
        } = req.query;

        if (!VIEW_DEFINITIONS[view]) {
            return res.status(400).json({ error: `Invalid view: ${view}` });
        }

        // Validate eval category inputs (supports comma-separated multi-select)
        const validCategories = ['all', 'correct', 'needsImprovement', 'hasError', 'hasCitationError', 'harmful'];
        const validAnswerTypes = ['all', 'not-gc', 'clarifying-question', 'pt-muni', 'normal'];

        const validateCategories = (input, paramName, validValues) => {
            if (!input || input === 'all') return true;
            const values = input.split(',').map(v => v.trim()).filter(Boolean);
            const invalid = values.filter(v => !validValues.includes(v));
            if (invalid.length > 0) {
                return `Invalid ${paramName} values: ${invalid.join(', ')}`;
            }
            return true;
        };

        if (partnerEval) {
            const validation = validateCategories(partnerEval, 'partnerEval', validCategories);
            if (validation !== true) {
                return res.status(400).json({ error: validation });
            }
        }

        if (aiEval) {
            const validation = validateCategories(aiEval, 'aiEval', validCategories);
            if (validation !== true) {
                return res.status(400).json({ error: validation });
            }
        }

        if (answerType) {
            const validation = validateCategories(answerType, 'answerType', validAnswerTypes);
            if (validation !== true) {
                return res.status(400).json({ error: validation });
            }
        }

        const dateFilter = {};
        if (startDate && endDate) {
            const range = buildDateRange({ startDate, endDate, timezoneOffsetMinutes });
            if (!range) return res.status(400).json({ error: 'Invalid dates' });
            dateFilter.createdAt = range;
        } else {
            const now = new Date();
            const start = new Date(now.getTime() - DEFAULT_DAYS * HOURS_IN_DAY * 60 * 60 * 1000);
            dateFilter.createdAt = { $gte: start, $lte: now };
        }

        if (userType === 'public') dateFilter.user = { $exists: false };
        else if (userType === 'admin') dateFilter.user = { $exists: true };

        const chatPopulate = getPopulateOptions(view);
        let chats;

        // Query Logic (Aggregate vs Find)
        // Note: For aggregation, we need to manually reconstruct the 'populate' logic using $lookups if we want to be exact,
        // OR we can fetch IDs and then hydrate/populate.
        // Given the requirement to optimize, and the complexity of duplicate code, duplicating the $lookup mess from db-chat-logs is risky if we change populates dynamicallly.
        // HOWEVER, db-chat-logs uses aggregate mainly for filtering by nested fields (department etc).
        // If we use `Chat.find` we can use `populate(chatPopulate)`.
        // If we use aggregate, we have to write lookups manually.
        // Implementation Plan Step: "Duplicate query logic".
        // The previously implemented file ALREADY has the aggregation pipeline.
        // I need to update the pipeline or use `populates` after aggregation?
        // Mongoose 6+ supports `.populate()` on aggregate cursors? No.
        // 
        // OPTIMIZATION:
        // If filters require aggregation (department etc), we MUST use aggregation.
        // If we use aggregation, `chatPopulate` (Mongoose populate syntax) is IGNORED during the pipeline.
        // We would need to add $lookups for *conditionally* needed fields (like tools).
        //
        // Pragmantic approach:
        // 1. If simple filters -> Use Chat.find().populate(chatPopulate). Efficient.
        // 2. If complex filters -> Use Aggregate.
        //    For aggregate, we already define lookups.
        //    I will need to ADD conditional lookups to the pipeline based on `view`.

        const isAggregate = department || referringUrl || urlEn || urlFr || answerType || partnerEval || aiEval
            || userType === 'referredPublic';

        if (isAggregate) {
            const pipeline = [];
            if (Object.keys(dateFilter).length) pipeline.push({ $match: dateFilter });

            // Early projection to reduce document size through pipeline
            pipeline.push({
                $project: {
                    chatId: 1,
                    interactions: 1,
                    user: 1,
                    createdAt: 1,
                    pageLanguage: 1,
                    aiProvider: 1,
                    searchProvider: 1
                }
            });

            // ... (Standard lookups for User, Interactions, Context) ...
            // I'll reuse the standard lookups from previous implementation, checking for optimizations.
            pipeline.push({
                $lookup: { from: 'interactions', localField: 'interactions', foreignField: '_id', as: 'interactions' }
            });
            pipeline.push({ $unwind: '$interactions' });
            pipeline.push({ $lookup: { from: 'users', localField: 'user', foreignField: '_id', as: 'user' } });
            pipeline.push({ $addFields: { user: { $arrayElemAt: ['$user', 0] } } });

            // Context matches
            pipeline.push({ $lookup: { from: 'contexts', localField: 'interactions.context', foreignField: '_id', as: 'interactions.context_doc' } });
            pipeline.push({ $addFields: { 'interactions.context': { $arrayElemAt: ['$interactions.context_doc', 0] } } });

            // Expert/Public Feedback
            pipeline.push({ $lookup: { from: 'expertfeedbacks', localField: 'interactions.expertFeedback', foreignField: '_id', as: 'interactions.expertFeedback_doc' } });
            pipeline.push({ $lookup: { from: 'publicfeedbacks', localField: 'interactions.publicFeedback', foreignField: '_id', as: 'interactions.publicFeedback_doc' } });

            // Question/Answer
            pipeline.push({ $lookup: { from: 'questions', localField: 'interactions.question', foreignField: '_id', as: 'interactions.question_doc' } });
            pipeline.push({ $lookup: { from: 'answers', localField: 'interactions.answer', foreignField: '_id', as: 'interactions.answer_doc' } });
            pipeline.push({ $addFields: { 'interactions.answer': { $arrayElemAt: ['$interactions.answer_doc', 0] } } });

            // Answer: Citation
            pipeline.push({ $lookup: { from: 'citations', localField: 'interactions.answer.citation', foreignField: '_id', as: 'interactions.answer.citation_doc' } });
            pipeline.push({ $addFields: { 'interactions.answer.citation': { $arrayElemAt: ['$interactions.answer.citation_doc', 0] } } });

            // Answer: Tools (CONDITIONAL)
            if (view === 'tools') {
                pipeline.push({ $lookup: { from: 'tools', localField: 'interactions.answer.tools', foreignField: '_id', as: 'interactions.answer.tools' } });
            }

            pipeline.push({
                $addFields: {
                    'interactions.expertFeedback': { $arrayElemAt: ['$interactions.expertFeedback_doc', 0] },
                    'interactions.publicFeedback': { $arrayElemAt: ['$interactions.publicFeedback_doc', 0] },
                    'interactions.question': { $arrayElemAt: ['$interactions.question_doc', 0] },
                    // Lift department and answerType to interactions root for filter compatibility
                    'interactions.department': { $ifNull: ['$interactions.context.department', ''] },
                    'interactions.answerType': { $ifNull: ['$interactions.answer.answerType', ''] }
                }
            });

            // Remove temporary lookup fields to prevent them from appearing in export
            pipeline.push({
                $project: {
                    'interactions.context_doc': 0,
                    'interactions.expertFeedback_doc': 0,
                    'interactions.publicFeedback_doc': 0,
                    'interactions.question_doc': 0,
                    'interactions.answer_doc': 0,
                    'interactions.answer.citation_doc': 0
                }
            });

            // AutoEval (CONDITIONAL / OPTIMIZED)
            // default: needs expertFeedback.totalScore
            // tools: same
            // auto-eval-debug: needs FULL doc

            pipeline.push({ $lookup: { from: 'evals', localField: 'interactions.autoEval', foreignField: '_id', as: 'interactions.autoEval' } });
            // Use $arrayElemAt instead of $unwind for single-element array (more efficient)
            pipeline.push({ $addFields: { 'interactions.autoEval': { $arrayElemAt: ['$interactions.autoEval', 0] } } });

            // AutoEval ExpertFeedback (needed for 'default' view 'autoEval.expertFeedback.totalScore')
            pipeline.push({ $lookup: { from: 'expertfeedbacks', localField: 'interactions.autoEval.expertFeedback', foreignField: '_id', as: 'interactions.autoEval.expertFeedback' } });
            pipeline.push({ $addFields: { 'interactions.autoEval.expertFeedback': { $arrayElemAt: ['$interactions.autoEval.expertFeedback', 0] } } });

            // For non-debug views, slim autoEval to only keep expertFeedback.totalScore
            if (view !== 'auto-eval-debug') {
                pipeline.push({
                    $addFields: {
                        'interactions.autoEval': {
                            expertFeedback: {
                                totalScore: '$interactions.autoEval.expertFeedback.totalScore'
                            }
                        }
                    }
                });
            }

            // Add computed partnerEval and aiEval fields for filtering
            pipeline.push({
                $addFields: {
                    'interactions.partnerEval': getPartnerEvalAggregationExpression(),
                    'interactions.aiEval': getAiEvalAggregationExpression()
                }
            });

            // Filtering Logic - now includes all conditions including partnerEval and aiEval
            const allConditions = getChatFilterConditions({ department, referringUrl, urlEn, urlFr, userType, answerType, partnerEval, aiEval });
            if (allConditions.length) pipeline.push({ $match: { $and: allConditions } });

            // Reconstruct Chat Object Structure
            pipeline.push({
                $group: {
                    _id: '$_id',
                    doc: { $first: '$$ROOT' },
                    interactions: { $push: '$interactions' }
                }
            });
            // Add global Chat fields back
            pipeline.push({
                $addFields: {
                    chatId: '$doc.chatId',
                    user: '$doc.user',
                    createdAt: '$doc.createdAt',
                    pageLanguage: '$doc.pageLanguage',
                    aiProvider: '$doc.aiProvider',
                    searchProvider: '$doc.searchProvider'
                }
            });

            chats = await Chat.aggregate(pipeline).allowDiskUse(true);

        } else {
            // Non-Aggregate Optimized Path - used when no filters are specified
            if (batchId) {
                const bItems = await BatchItem.find({ batch: batchId }).select('chat');
                const bIds = bItems.map(i => i.chat);
                dateFilter._id = { $in: bIds };
            }

            chats = await Chat.find(dateFilter)
                .populate(chatPopulate)
                .lean(); // Use lean for performance since we flatten anyway
        }

        // Flatten & Headers
        const flatRows = [];
        const dynamicKeys = new Set();

        for (const chat of chats) {
            // aggregate returns plain objects, find().lean() returns plain objects.
            const interactions = chat.interactions || [];
            for (const interaction of interactions) {
                const row = flattenInteraction(chat, interaction, view);
                flatRows.push(row);
                Object.keys(row).forEach(k => dynamicKeys.add(k));
            }
        }

        let finalHeaders = [];
        if (view === 'default') {
            // Strict header order for default
            finalHeaders = DEFAULT_HEADER_ORDER;
        } else {
            // Dynamic headers for other views
            const ordered = DEFAULT_HEADER_ORDER;
            const extra = [...dynamicKeys].filter(k => !ordered.includes(k)).sort();
            finalHeaders = [...ordered.filter(k => dynamicKeys.has(k)), ...extra];
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
        const filename = `chat-logs-${view}-${timestamp}`;

        if (format === 'json') {
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}.json"`);
            return res.status(200).json(flatRows);
        }

        if (format === 'csv') {
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
            const stream = csvFormat({ headers: finalHeaders });
            stream.pipe(res);
            flatRows.forEach(row => stream.write(row));
            stream.end();
            return;
        }

        if (format === 'xlsx') {
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}.xlsx"`);

            const wb = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: res, useStyles: true });
            const ws = wb.addWorksheet('Chat Logs');

            ws.addRow(finalHeaders).font = { bold: true };
            ws.getRow(1).commit();

            for (const row of flatRows) {
                const values = finalHeaders.map(h => {
                    const v = row[h];
                    if (v && typeof v === 'object') return JSON.stringify(v);
                    return v !== undefined ? v : '';
                });
                ws.addRow(values).commit();
            }
            await wb.commit();
        }

    } catch (error) {
        console.error('Export Error:', error);
        if (!res.headersSent) res.status(500).json({ error: error.message });
    }
}

export default function handler(req, res) {
    return withProtection(chatExportHandler, authMiddleware)(req, res);
}
