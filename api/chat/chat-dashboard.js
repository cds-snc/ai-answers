import dbConnect from '../db/db-connect.js';
import { Chat } from '../../models/chat.js';
import mongoose from 'mongoose';
import { authMiddleware, partnerOrAdminMiddleware, withProtection } from '../../middleware/auth.js';
import { getPartnerEvalAggregationExpression, getAiEvalAggregationExpression, getPartnerContentIssueAggregationExpression, getChatFilterConditions, getFeedbackDataProjection } from '../util/chat-filters.js';
import { frForProgram } from '../util/programActionFr.js';

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
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
};

const parseFallbackDate = (value) => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const getDateRange = ({ startDate, endDate, timezoneOffsetMinutes }) => {
  if (!startDate || !endDate) return null;
  const start = parseLocalDateTime(startDate, { timezoneOffsetMinutes }) || parseFallbackDate(startDate);
  const end = parseLocalDateTime(endDate, { timezoneOffsetMinutes, endOfDayIfNoTime: true }) || parseFallbackDate(endDate);
  if (!start || !end) return null;
  return { $gte: start, $lte: end };
};

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

async function chatDashboardHandler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    await dbConnect();

    const {
      department = '',
      referringUrl = '',
      userType = 'all',
      urlEn = '',
      urlFr = '',
      answerType = '',
      partnerEval = '',
      aiEval = '',
      evalLogic = 'and',
      startDate,
      endDate,
      limit: limitParam,
      lastId: lastIdParam,
      start: startParam,
      length: lengthParam,
      orderBy: orderByParam,
      orderDir: orderDirParam,
      draw: drawParam,
      search: searchParam,
      timezoneOffsetMinutes: timezoneOffsetParam
    } = req.query;

    const parsedTimezoneOffset = Number.isFinite(parseInt(timezoneOffsetParam, 10)) ? parseInt(timezoneOffsetParam, 10) : undefined;
    const dateRange = getDateRange({ startDate, endDate, timezoneOffsetMinutes: parsedTimezoneOffset });
    if (!dateRange) {
      return res.status(400).json({ error: 'startDate and endDate are required and must be valid dates' });
    }
    const limit = Math.min(Math.max(parseInt(limitParam, 10) || 500, 1), 2000);
    const start = Number.isFinite(parseInt(startParam, 10)) ? parseInt(startParam, 10) : 0;
    const length = Number.isFinite(parseInt(lengthParam, 10)) ? parseInt(lengthParam, 10) : null;
    const orderBy = orderByParam || 'createdAt';
    const orderDir = (orderDirParam || 'desc').toLowerCase() === 'asc' ? 1 : -1;
    const isDataTablesMode = length !== null; // when length provided, use offset/limit style

    // Build initial match for createdAt and optional lastId for pagination
    const pipeline = [];
    const initialMatch = {};
    if (dateRange) {
      initialMatch.createdAt = dateRange;
    }

    let lastId = null;
    if (!isDataTablesMode && lastIdParam) {
      try {
        lastId = mongoose.Types.ObjectId(lastIdParam);
        initialMatch._id = { $lt: lastId };
      } catch (err) {
        return res.status(400).json({ error: 'Invalid lastId' });
      }
    }

    if (Object.keys(initialMatch).length) {
      pipeline.push({ $match: initialMatch });
    }

    // Trim early to only the fields we need downstream. interactionIds is
    // kept as a separate copy of the raw ObjectId array (mirroring
    // eval-dashboard.js) so questionNumber can be computed via
    // $indexOfArray after 'interactions' is overwritten with populated docs.
    pipeline.push({
      $project: {
        chatId: 1,
        user: 1,
        pageLanguage: 1,
        createdAt: 1,
        interactionIds: '$interactions'
      }
    });

    // One row per interaction (question/answer pair) from here on - a
    // multi-turn chat produces multiple rows sharing the same chatId,
    // rather than one row per chat summarizing all of its interactions.
    pipeline.push({
      $lookup: {
        from: 'interactions',
        localField: 'interactionIds',
        foreignField: '_id',
        as: 'interactions'
      }
    });

    pipeline.push({
      $unwind: {
        path: '$interactions',
        preserveNullAndEmptyArrays: false
      }
    });

    pipeline.push({
      $addFields: {
        questionNumber: {
          $add: [
            { $indexOfArray: ['$interactionIds', '$interactions._id'] },
            1
          ]
        }
      }
    });

    // Lookup questions to get redactedQuestion
    pipeline.push({
      $lookup: {
        from: 'questions',
        localField: 'interactions.question',
        foreignField: '_id',
        as: 'interactionQuestion'
      }
    });
    pipeline.push({
      $addFields: {
        'interactions.redactedQuestion': { $ifNull: [{ $arrayElemAt: ['$interactionQuestion.redactedQuestion', 0] }, ''] }
      }
    });

    // Lookup answers - answerType (for filtering), displayed content (falls
    // back to englishAnswer, matching the content || englishAnswer pattern
    // used elsewhere e.g. QuestionAnswerService.js), and the citation ref
    // for the citations lookup below.
    pipeline.push({
      $lookup: {
        from: 'answers',
        localField: 'interactions.answer',
        foreignField: '_id',
        as: 'interactionAnswer'
      }
    });
    pipeline.push({
      $addFields: {
        'interactions.answerType': { $ifNull: [{ $arrayElemAt: ['$interactionAnswer.answerType', 0] }, ''] },
        'interactions.answerContent': {
          $ifNull: [
            { $arrayElemAt: ['$interactionAnswer.content', 0] },
            { $ifNull: [{ $arrayElemAt: ['$interactionAnswer.englishAnswer', 0] }, ''] }
          ]
        },
        'interactions.citationRef': { $arrayElemAt: ['$interactionAnswer.citation', 0] }
      }
    });

    // Lookup the citation doc for the citation link column - prefer the
    // partner-provided URL, fall back to the AI-picked one (same priority
    // used by metrics-citations.js).
    pipeline.push({
      $lookup: {
        from: 'citations',
        localField: 'interactions.citationRef',
        foreignField: '_id',
        as: 'interactionCitation'
      }
    });
    pipeline.push({
      $addFields: {
        'interactions.citationUrl': {
          $let: {
            vars: {
              provided: { $ifNull: [{ $arrayElemAt: ['$interactionCitation.providedCitationUrl', 0] }, ''] },
              ai: { $ifNull: [{ $arrayElemAt: ['$interactionCitation.aiCitationUrl', 0] }, ''] }
            },
            in: { $cond: [{ $ne: ['$$provided', ''] }, '$$provided', '$$ai'] }
          }
        }
      }
    });

    // Lookup contexts - department and program (the "Service" column)
    pipeline.push({
      $lookup: {
        from: 'contexts',
        localField: 'interactions.context',
        foreignField: '_id',
        as: 'interactionContext'
      }
    });
    pipeline.push({
      $addFields: {
        'interactions.department': { $ifNull: [{ $arrayElemAt: ['$interactionContext.department', 0] }, ''] },
        'interactions.program': { $ifNull: [{ $arrayElemAt: ['$interactionContext.program', 0] }, ''] }
      }
    });

    // Lookup expertFeedbacks for partner eval - only need totalScore and sentence scores
    pipeline.push({
      $lookup: {
        from: 'expertfeedbacks',
        localField: 'interactions.expertFeedback',
        foreignField: '_id',
        as: 'expertFeedbackDocs'
      }
    });
    pipeline.push({
      $addFields: {
        'interactions.expertFeedbackData': getFeedbackDataProjection('$expertFeedbackDocs', { includeContentIssue: true })
      }
    });

    // Lookup evals - only need the expertFeedback reference
    pipeline.push({
      $lookup: {
        from: 'evals',
        localField: 'interactions.autoEval',
        foreignField: '_id',
        as: 'interactionEval'
      }
    });
    pipeline.push({
      $addFields: {
        'interactions.autoEvalExpertFeedbackRef': { $arrayElemAt: ['$interactionEval.expertFeedback', 0] }
      }
    });

    // Lookup autoEval's expertFeedback - only need totalScore and scores
    pipeline.push({
      $lookup: {
        from: 'expertfeedbacks',
        localField: 'interactions.autoEvalExpertFeedbackRef',
        foreignField: '_id',
        as: 'autoEvalExpertFeedbackDocs'
      }
    });
    pipeline.push({
      $addFields: {
        'interactions.autoEvalFeedbackData': getFeedbackDataProjection('$autoEvalExpertFeedbackDocs')
      }
    });

    // Clean up temporary lookup arrays to free memory
    pipeline.push({
      $project: {
        interactionAnswer: 0,
        interactionCitation: 0,
        interactionContext: 0,
        interactionQuestion: 0,
        expertFeedbackDocs: 0,
        interactionEval: 0,
        autoEvalExpertFeedbackDocs: 0
      }
    });

    // Compute partnerEval and aiEval directly for this interaction - no
    // cross-interaction $addToSet/priority-switch needed now that each row
    // is a single interaction rather than a summary of the whole chat.
    pipeline.push({
      $addFields: {
        'interactions.partnerEval': getPartnerEvalAggregationExpression('$interactions.expertFeedbackData'),
        'interactions.aiEval': getAiEvalAggregationExpression('$interactions.autoEvalFeedbackData'),
        'interactions.partnerHasContentIssue': getPartnerContentIssueAggregationExpression('$interactions.expertFeedbackData')
      }
    });

    // Lookup user who created the chat to include their email
    pipeline.push({
      $lookup: {
        from: 'users',
        localField: 'user',
        foreignField: '_id',
        as: 'creator'
      }
    });
    pipeline.push({
      $addFields: {
        creatorEmail: { $ifNull: [{ $arrayElemAt: ['$creator.email', 0] }, ''] }
      }
    });
    pipeline.push({ $project: { creator: 0 } });

    const filters = { userType, department, referringUrl, urlEn, urlFr, answerType, partnerEval, aiEval, evalLogic };
    const andFilters = getChatFilterConditions(filters);

    if (andFilters.length) {
      pipeline.push({ $match: { $and: andFilters } });
    }

    // Project fields for the UI - one row per interaction
    pipeline.push({
      $project: {
        _id: '$interactions._id',
        interactionId: { $ifNull: ['$interactions.interactionId', ''] },
        chatId: 1,
        pageLanguage: 1,
        createdAt: '$interactions.createdAt',
        // The chat's own createdAt (distinct from the interaction-level one
        // above) and this interaction's 1-based position within its chat -
        // together they let the default sort cluster a multi-turn chat's
        // rows together and in question order, instead of interleaving them
        // with other chats' rows whenever individual interaction
        // timestamps happen to fall in between (see the $sort stage below).
        chatCreatedAt: '$createdAt',
        questionNumber: 1,
        department: '$interactions.department',
        program: '$interactions.program',
        redactedQuestion: '$interactions.redactedQuestion',
        answerContent: '$interactions.answerContent',
        citationUrl: '$interactions.citationUrl',
        partnerEval: '$interactions.partnerEval',
        aiEval: '$interactions.aiEval',
        partnerHasContentIssue: { $ifNull: ['$interactions.partnerHasContentIssue', false] },
        userType: {
          $cond: {
            if: { $and: [{ $ne: ['$creatorEmail', ''] }, { $ne: ['$creatorEmail', null] }] },
            then: 'admin',
            else: 'public'
          }
        }
      }
    });

    // Handle search parameter for chatId (after projection, so applied against the final field)
    const searchFilter = searchParam ? { chatId: { $regex: escapeRegex(searchParam), $options: 'i' } } : null;
    if (searchFilter) {
      pipeline.push({ $match: searchFilter });
    }

    // Handle per-column searches from the frontend (currently just the
    // Service/program column) - same JSON-encoded columnSearch contract as
    // eval-dashboard.js.
    let columnSearch = req.query.columnSearch || null;
    if (typeof columnSearch === 'string' && columnSearch.trim()) {
      try {
        columnSearch = JSON.parse(columnSearch);
      } catch (err) {
        console.warn('Failed to parse columnSearch filter', err);
        columnSearch = null;
      }
    }
    if (columnSearch && typeof columnSearch === 'object' && Object.keys(columnSearch).length) {
      const andClauses = [];
      for (const [col, val] of Object.entries(columnSearch)) {
        const v = String(val || '').trim();
        if (!v) continue;
        andClauses.push({ [col]: { $regex: escapeRegex(v), $options: 'i' } });
      }
      if (andClauses.length) pipeline.push({ $match: { $and: andClauses } });
    }

    // Keep a copy of pipeline before adding sort/limit to calculate totalCount
    const pipelineBeforeSortLimit = pipeline.slice();

    // Dynamic sort mapping - all columns that can be sorted on
    const sortFieldMap = {
      createdAt: 'createdAt',
      chatId: 'chatId',
      department: 'department',
      program: 'program',
      partnerEval: 'partnerEval',
      aiEval: 'aiEval'
    };
    const sortField = sortFieldMap[orderBy] || 'createdAt';
    // Default view (no column sort applied - the only way 'createdAt' is
    // ever reached, since no visible column maps to it): sort by the CHAT's
    // own createdAt rather than each interaction's own, with questionNumber
    // as the tiebreaker. Sorting by each row's own interaction timestamp
    // would interleave a multi-turn chat's rows with unrelated chats'
    // whenever their individual interactions happen to fall in between in
    // wall-clock time (a real conversation's turns can be minutes apart).
    // Grouping by the chat's single, constant createdAt keeps all of a
    // chat's matching rows adjacent and in question order instead.
    // Explicit column sorts (Department, Service, etc.) keep the same
    // chatCreatedAt/questionNumber pair as secondary tiebreakers, so rows
    // that tie on the sorted column (e.g. same department) still cluster by
    // chat rather than falling back to _id order alone.
    const sortStage = sortField === 'createdAt'
      ? { $sort: { chatCreatedAt: orderDir, questionNumber: 1, _id: orderDir } }
      : { $sort: { [sortField]: orderDir, chatCreatedAt: -1, questionNumber: 1, _id: orderDir } };
    pipeline.push(sortStage);

    if (isDataTablesMode) {
      if (start > 0) pipeline.push({ $skip: start });
      pipeline.push({ $limit: Math.min(Math.max(length, 1), 2000) });
    } else {
      pipeline.push({ $limit: limit });
    }

    // Build count pipeline before modifying main pipeline with sort/limit
    const countPipeline = pipelineBeforeSortLimit.slice();
    countPipeline.push({ $count: 'totalCount' });

    // Run data and count queries in parallel for better performance
    const [results, countResult] = await Promise.all([
      Chat.aggregate(pipeline).allowDiskUse(true),
      Chat.aggregate(countPipeline).allowDiskUse(true)
    ]);

    const totalCount = (countResult && countResult[0] && countResult[0].totalCount) || 0;

    const chats = results.map((row) => ({
      _id: row._id ? String(row._id) : '',
      interactionId: row.interactionId || '',
      chatId: row.chatId || '',
      department: row.department || '',
      program: row.program || '',
      programFr: frForProgram(row.program),
      redactedQuestion: row.redactedQuestion || '',
      answerContent: row.answerContent || '',
      citationUrl: row.citationUrl || '',
      date: row.createdAt ? row.createdAt.toISOString() : null,
      questionNumber: row.questionNumber || 0,
      pageLanguage: row.pageLanguage || '',
      partnerEval: row.partnerEval || '',
      aiEval: row.aiEval || '',
      partnerHasContentIssue: !!row.partnerHasContentIssue,
      userType: row.userType || 'public'
    }));

    if (isDataTablesMode) {
      // DataTables server-side response format
      const draw = Number.isFinite(parseInt(drawParam, 10)) ? parseInt(drawParam, 10) : 0;
      return res.status(200).json({
        draw,
        recordsTotal: totalCount,
        recordsFiltered: totalCount,
        data: chats
      });
    }

    // Cursor-based response for batch loading
    const nextLastId = chats.length > 0 && chats.length === limit ? chats[chats.length - 1]._id : null;
    const progress = totalCount > 0 ? `${Math.min(Math.round((chats.length / totalCount) * 100), 100)}%` : '100%';
    return res.status(200).json({ success: true, logs: chats, lastId: nextLastId, totalCount, progress });
  } catch (error) {
    console.error('Failed to fetch chat dashboard data', error);
    return res.status(500).json({
      error: 'Failed to fetch chat dashboard data',
      details: error.message
    });
  }
}

export default function handler(req, res) {
  return withProtection(
    chatDashboardHandler,
    authMiddleware,
    partnerOrAdminMiddleware
  )(req, res);
}
