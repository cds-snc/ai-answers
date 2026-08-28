import { resolveReviewerMatch } from '../util/reviewer-filter.js';
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

// Duplicate of api/util/db-query.js's own escapeRegex (and api/util/
// chat-filters.js's) - a code review flagged all three as the same
// function copy-pasted three times (confirmed byte-identical) and worth
// consolidating to one shared import. Deliberately left as-is here: out of
// scope for the chat-viewer-a11y work that surfaced it. Safe to
// consolidate later - see api/util/db-query.js's escapeRegex.
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

    // TODO: cursor/batch mode (no `length` param - currently unused by any
    // caller, the UI always sends `length`) filters on Chat._id here, but
    // the final $project below reassigns the response's _id to the
    // interaction's own _id, so the lastId this mode returns no longer
    // matches what this filter expects on the next call. Dormant today
    // since nothing exercises this path, but a live landmine for any
    // future caller of the non-DataTables mode. Needs its own cursor field
    // (e.g. filter on the underlying Chat _id explicitly, separate from the
    // response row's _id) before anything relies on it again.
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

    // TODO: preserveNullAndEmptyArrays was true before this file's
    // restructure to per-interaction rows; a chat with an empty or fully
    // dangling `interactions` array now produces zero rows and is invisible
    // in results/recordsTotal entirely, where it used to surface as one
    // (mostly empty) row. Judgment call, not a clear bug: in a per-Q&A-row
    // table there's arguably nothing to show for a chat with no
    // interactions, but if Chat Dashboard needs to help spot broken/empty
    // chat records, this quietly removed that visibility. Revisit if that
    // turns out to matter.
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
        'interactions.redactedQuestion': { $ifNull: [{ $arrayElemAt: ['$interactionQuestion.redactedQuestion', 0] }, ''] },
        // Both needed for the admin display rule (see src/utils/answerLanguage.js's
        // resolveDisplayContent): EN/FR show redactedQuestion as-is, anything
        // else falls back to englishQuestion - questionLanguage is what
        // decides which.
        'interactions.questionLanguage': { $ifNull: [{ $arrayElemAt: ['$interactionQuestion.language', 0] }, ''] },
        'interactions.englishQuestion': { $ifNull: [{ $arrayElemAt: ['$interactionQuestion.englishQuestion', 0] }, ''] }
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
        // Computed once here, referenced by answerContent's own fallback
        // below - a field added earlier in an $addFields stage is visible
        // to a later field's expression in the same stage. Kept as its own
        // field (not folded into answerContent) so the frontend can apply
        // the questionLanguage-driven display rule the same way it does for
        // the question (resolveDisplayContent), independent of
        // answerContent's separate null-safety fallback below.
        'interactions.englishAnswer': { $ifNull: [{ $arrayElemAt: ['$interactionAnswer.englishAnswer', 0] }, ''] },
        'interactions.answerContent': {
          $ifNull: [
            { $arrayElemAt: ['$interactionAnswer.content', 0] },
            '$interactions.englishAnswer'
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
        'interactions.expertFeedbackData': getFeedbackDataProjection('$expertFeedbackDocs', { includeContentIssue: true }),
        // Reviewer identity for "who evaluated this" columns (Manage your
        // account page's group table); expertFeedbackDocs is dropped below.
        'interactions.reviewerEmail': { $ifNull: [{ $arrayElemAt: ['$expertFeedbackDocs.expertEmail', 0] }, ''] }
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

    const reviewerMatch = await resolveReviewerMatch({ institution: req.query.institution, group: req.query.group, reviewerEmail: req.query.reviewerEmail });
    const filters = { userType, department, referringUrl, urlEn, urlFr, answerType, partnerEval, aiEval, evalLogic, reviewerMatch };
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
        questionLanguage: '$interactions.questionLanguage',
        englishQuestion: '$interactions.englishQuestion',
        answerContent: '$interactions.answerContent',
        englishAnswer: '$interactions.englishAnswer',
        citationUrl: '$interactions.citationUrl',
        partnerEval: '$interactions.partnerEval',
        aiEval: '$interactions.aiEval',
        partnerHasContentIssue: { $ifNull: ['$interactions.partnerHasContentIssue', false] },
        creatorEmail: 1,
        reviewerEmail: '$interactions.reviewerEmail',
        userType: {
          $cond: {
            if: { $and: [{ $ne: ['$creatorEmail', ''] }, { $ne: ['$creatorEmail', null] }] },
            then: 'admin',
            else: 'public'
          }
        }
      }
    });

    // Global search (after projection, so applied against the final,
    // flattened fields) - matches across every displayed column, not just
    // chatId, since the dashboard has a single search box for the whole
    // table rather than per-column filters.
    // TODO: this is an unanchored, case-insensitive $regex $or across 7
    // fields (including full untruncated answerContent), with no text
    // index, evaluated on every date-range-matched row before pagination -
    // cost scales with total interaction volume in the date range, not
    // page size. Fine at current admin-tool data volumes; revisit (a text
    // index, or narrowing which fields participate) if search gets slow as
    // data grows.
    if (searchParam) {
      const esc = escapeRegex(searchParam);
      const searchOr = [
        { chatId: { $regex: esc, $options: 'i' } },
        { interactionId: { $regex: esc, $options: 'i' } },
        { department: { $regex: esc, $options: 'i' } },
        { program: { $regex: esc, $options: 'i' } },
        { redactedQuestion: { $regex: esc, $options: 'i' } },
        { answerContent: { $regex: esc, $options: 'i' } },
        { citationUrl: { $regex: esc, $options: 'i' } }
      ];
      pipeline.push({
        $match: { $or: searchOr }
      });
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
    // chatCreatedAt/chatId/questionNumber trio as secondary tiebreakers, so
    // rows that tie on the sorted column (e.g. same department) still
    // cluster by chat. chatId has to come BEFORE questionNumber here, not
    // after (a $sort is lexicographic - questionNumber ahead of chatId
    // would group every chat's Q1 together, then every chat's Q2, etc.,
    // still interleaving whenever two chats tie on chatCreatedAt; chatId
    // first groups by chat, then questionNumber orders within that chat's
    // own block). It replaces the row's own post-$project _id (the
    // interaction's id, not the chat's) as the tiebreaker specifically so
    // two chats created in the same millisecond still group instead of
    // interleaving.
    const sortStage = sortField === 'createdAt'
      ? { $sort: { chatCreatedAt: orderDir, chatId: orderDir, questionNumber: 1 } }
      : { $sort: { [sortField]: orderDir, chatCreatedAt: -1, chatId: -1, questionNumber: 1 } };
    pipeline.push(sortStage);

    const pageSize = isDataTablesMode ? Math.min(Math.max(length, 1), 2000) : null;

    // Group-based pagination only applies to the default date sort;
    // explicit column sorts intentionally fall back to row-based
    // pagination (see below) - not a bug if a chat's rows end up apart
    // from each other in that mode.
    //
    // Group-based (never-split-a-chat) pagination only applies to the
    // default view (no explicit column sort - date order, where a chat
    // really is one unit worth keeping together). An explicit sort by a
    // per-question field (Department/Program/Service) is deliberately
    // scoped to individual interactions, not whole chats - "sort by
    // Department = IRCC" means show me the IRCC questions first, not every
    // other question in the same conversation dragged along with them,
    // same as how a search match doesn't pull in its chat's unrelated
    // siblings either. So those sorts fall back to plain row-based
    // pagination below, and a chat's rows can end up apart from each other
    // (or split across a page) in that mode - that's correct there, not
    // the bug this feature exists to prevent. See the matching, more
    // detailed comment in api/eval/eval-dashboard.js for the full
    // reasoning (single continuous aggregation so the $lookup joins above
    // still run exactly once, no $setWindowFields, etc.) - not repeated
    // here.
    //
    // TODO: if this turns out to cost more than expected in practice (real
    // DocumentDB, not local dev), it's fine to strip this back out for
    // Chat Dashboard specifically (revert to the plain row-based
    // $skip/$limit) and revisit later rather than live with a slow
    // dashboard. Eval Dashboard has the equivalent TODO.
    const useChatGroupedPagination = isDataTablesMode && sortField === 'createdAt';

    if (useChatGroupedPagination) {
      pipeline.push({ $group: { _id: '$chatId', sortKeyValue: { $first: '$chatCreatedAt' }, rows: { $push: '$$ROOT' } } });
      pipeline.push({ $sort: { sortKeyValue: orderDir, _id: orderDir } });
      if (start > 0) pipeline.push({ $skip: start });
      pipeline.push({ $limit: Math.min(pageSize + 1, 2001) });
      pipeline.push({ $unwind: '$rows' });
      pipeline.push({ $replaceRoot: { newRoot: '$rows' } });
    } else if (isDataTablesMode) {
      // No +1 lookahead needed here (unlike the chat-grouped branch above)
      // - this mode always has a real totalCount from countPipeline below,
      // not a synthetic hasMore guess, so there's nothing to detect.
      if (start > 0) pipeline.push({ $skip: start });
      pipeline.push({ $limit: pageSize });
    } else {
      pipeline.push({ $limit: limit });
    }

    // Build count pipeline before modifying main pipeline with sort/limit -
    // counts distinct chats to match group-based pagination, or plain rows
    // to match the row-based fallback, whichever mode is active.
    const countPipeline = pipelineBeforeSortLimit.slice();
    if (useChatGroupedPagination) countPipeline.push({ $group: { _id: '$chatId' } });
    countPipeline.push({ $count: 'totalCount' });

    // Run data and count queries in parallel for better performance
    const [flatResults, countResult] = await Promise.all([
      Chat.aggregate(pipeline).allowDiskUse(true),
      Chat.aggregate(countPipeline).allowDiskUse(true)
    ]);

    const totalCount = (countResult && countResult[0] && countResult[0].totalCount) || 0;

    let results = flatResults;
    if (useChatGroupedPagination && pageSize !== null) {
      // flatResults may include one extra chat's worth of rows (the +1
      // lookahead group) purely so a mismatched page length here would
      // still be caught in review - trim it back off, same as
      // eval-dashboard.js. totalCount above is unaffected either way.
      const seenChatIds = [];
      for (const r of flatResults) {
        if (seenChatIds[seenChatIds.length - 1] !== r.chatId) seenChatIds.push(r.chatId);
      }
      if (seenChatIds.length > pageSize) {
        const lookaheadChatId = seenChatIds[pageSize];
        results = flatResults.filter((r) => r.chatId !== lookaheadChatId);
      }
    }
    // Row-based fallback needs no trim here - its own $limit above (no +1)
    // already fetched exactly one page's worth.

    const chats = results.map((row) => ({
      _id: row._id ? String(row._id) : '',
      interactionId: row.interactionId || '',
      chatId: row.chatId || '',
      department: row.department || '',
      program: row.program || '',
      programFr: frForProgram(row.program),
      redactedQuestion: row.redactedQuestion || '',
      questionLanguage: row.questionLanguage || '',
      englishQuestion: row.englishQuestion || '',
      answerContent: row.answerContent || '',
      englishAnswer: row.englishAnswer || '',
      citationUrl: row.citationUrl || '',
      date: row.createdAt ? row.createdAt.toISOString() : null,
      questionNumber: row.questionNumber || 0,
      pageLanguage: row.pageLanguage || '',
      partnerEval: row.partnerEval || '',
      aiEval: row.aiEval || '',
      partnerHasContentIssue: !!row.partnerHasContentIssue,
      userType: row.userType || 'public',
      creatorEmail: row.creatorEmail || '',
      reviewerEmail: row.reviewerEmail || ''
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
