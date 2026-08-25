import dbConnect from '../db/db-connect.js';
import { Chat } from '../../models/chat.js';
import { withProtection, authMiddleware, partnerOrAdminMiddleware } from '../../middleware/auth.js';
import { getChatFilterConditions, getPartnerEvalAggregationExpressionWithoutCitation, getAiEvalAggregationExpressionWithoutCitation, getPartnerContentIssueAggregationExpression, getHasCitationErrorAggregationExpression, getFeedbackDataProjection } from '../util/chat-filters.js';
import { frForProgram, frForAction } from '../util/programActionFr.js';

const HOURS_IN_DAY = 24;

const getDateRange = (query) => {
  const { startDate, endDate, filterType, presetValue } = query;

  if (startDate && endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())) {
      return { $gte: start, $lte: end };
    }
  }

  if (filterType === 'preset') {
    if (presetValue === 'all') return null;
    const hours = Number(presetValue) * HOURS_IN_DAY;
    if (!Number.isNaN(hours) && hours > 0) {
      const now = new Date();
      const start = new Date(now.getTime() - hours * 60 * 60 * 1000);
      return { $gte: start, $lte: now };
    }
  }

  const now = new Date();
  const start = new Date(now.getTime() - HOURS_IN_DAY * 60 * 60 * 1000);
  return { $gte: start, $lte: now };
};

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

async function evalDashboardHandler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ message: 'Method not allowed' });

  try {
    await dbConnect();

    const {
      startDate,
      endDate,
      filterType,
      presetValue,
      start: startParam,
      length: lengthParam,
      orderBy: orderByParam,
      orderDir: orderDirParam,
      draw: drawParam,
      search: searchParam,
      noMatchReasonType,
      fallbackType,
      onlyEmpty,
      processed,
      department = '',
      referringUrl = '',
      urlEn = '',
      urlFr = '',
      userType = 'all',
      answerType = '',
      partnerEval = '',
      aiEval = '',
      evalLogic = 'and'
    } = req.query;

    const dateRange = getDateRange({ startDate, endDate, filterType, presetValue });
    const start = Number.isFinite(parseInt(startParam, 10)) ? parseInt(startParam, 10) : 0;
    const length = Number.isFinite(parseInt(lengthParam, 10)) ? parseInt(lengthParam, 10) : null;
    const isDataTablesMode = length !== null;
    const orderBy = orderByParam || 'createdAt';
    const orderDir = (orderDirParam || 'desc').toLowerCase() === 'asc' ? 1 : -1;

    const pipeline = [];

    pipeline.push({
      $project: {
        chatId: 1,
        user: 1,
        pageLanguage: 1,
        interactionIds: '$interactions',
        // Carried through to the sort stage below as a chat-clustering
        // tiebreaker, mirroring chat-dashboard.js - kept distinct from the
        // per-interaction `createdAt` projected later (from
        // interactions.createdAt), which is what the UI's Date column and
        // per-row display actually show.
        chatCreatedAt: '$createdAt'
      }
    });

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

    if (dateRange) {
      pipeline.push({ $match: { 'interactions.createdAt': dateRange } });
    }

    // Lookup answer - only need answerType
    pipeline.push({
      $lookup: {
        from: 'answers',
        localField: 'interactions.answer',
        foreignField: '_id',
        as: 'answerDoc'
      }
    });

    // Extract answerType and the full tool ID list for this answer
    pipeline.push({
      $addFields: {
        'interactions.answerType': { $ifNull: [{ $arrayElemAt: ['$answerDoc.answerType', 0] }, ''] },
        answerToolIds: { $ifNull: [{ $arrayElemAt: ['$answerDoc.tools', 0] }, []] }
      }
    });

    // Lookup every tool call for the answer, not just the first. Plain
    // localField/foreignField array $lookup - the same shape already
    // proven above (interactionIds -> interactions), not the newer
    // combined pipeline form, so this introduces no new DocumentDB
    // compatibility risk. Trade-off: joins full tool docs (including
    // input/output) before filtering to downloadWebPage below, rather
    // than filtering/projecting in the join itself.
    // TODO: a `pipeline: [{ $project: { tool: 1, error: 1 } }]` form of this
    // $lookup would avoid shipping full tool payloads per row. Deliberately
    // deferred - the leaner sub-pipeline $lookup form was tried and reverted
    // earlier because it couldn't be validated against real DocumentDB;
    // don't re-open this without running explain("executionStats") against
    // an actual DocumentDB cluster first.
    pipeline.push({
      $lookup: {
        from: 'tools',
        localField: 'answerToolIds',
        foreignField: '_id',
        as: 'answerToolDocs'
      }
    });
    pipeline.push({
      $addFields: {
        downloadTools: {
          $filter: {
            input: '$answerToolDocs',
            as: 'tool',
            cond: { $eq: ['$$tool.tool', 'downloadWebPage'] }
          }
        }
      }
    });
    pipeline.push({
      $addFields: {
        downloadSucceededCount: {
          $size: { $filter: { input: '$downloadTools', as: 't', cond: { $eq: ['$$t.error', 'none'] } } }
        },
        downloadTotalCount: { $size: '$downloadTools' }
      }
    });
    // hasDownload: 'success' | 'partial' | 'failed' | '' (no downloads)
    // 'failed', not 'fail' - so the free-text search's plain substring match
    // on this field (see the orClauses below) catches both "fail" and
    // "failed" as search terms without a separate special case: "fail" is
    // already a prefix of "failed".
    // TODO: this classification is duplicated 3x (this $switch, plain JS in
    // DownloadPanel.js, hardcoded again in EvalDashboardPage.js's render) -
    // consider sharing it across the api/src boundary like getItemVerdict
    // in batchItems.js does. Deliberately deferred rather than consolidated
    // now: the planned "show all matching pills" work changes the
    // classification shape itself (single winner -> set of applicable
    // states), so a shared module should be designed once that scope is
    // defined, not built twice.
    pipeline.push({
      $addFields: {
        hasDownload: {
          $switch: {
            branches: [
              { case: { $eq: ['$downloadTotalCount', 0] }, then: '' },
              { case: { $eq: ['$downloadSucceededCount', '$downloadTotalCount'] }, then: 'success' },
              { case: { $eq: ['$downloadSucceededCount', 0] }, then: 'failed' }
            ],
            default: 'partial'
          }
        }
      }
    });

    // Lookup eval - only need processed, hasMatches, fallbackType, noMatchReasonType, expertFeedback ref
    pipeline.push({
      $lookup: {
        from: 'evals',
        localField: 'interactions.autoEval',
        foreignField: '_id',
        as: 'evalDoc'
      }
    });
    // Extract only needed fields immediately
    pipeline.push({
      $addFields: {
        eval: {
          processed: { $arrayElemAt: ['$evalDoc.processed', 0] },
          hasMatches: { $arrayElemAt: ['$evalDoc.hasMatches', 0] },
          fallbackType: { $arrayElemAt: ['$evalDoc.fallbackType', 0] },
          noMatchReasonType: { $arrayElemAt: ['$evalDoc.noMatchReasonType', 0] },
          hasCitationError: { $arrayElemAt: ['$evalDoc.hasCitationError', 0] },
          hasError: { $arrayElemAt: ['$evalDoc.hasError', 0] },
          expertFeedback: { $arrayElemAt: ['$evalDoc.expertFeedback', 0] }
        }
      }
    });

    // Lookup creator user - only need email
    pipeline.push({
      $lookup: {
        from: 'users',
        localField: 'user',
        foreignField: '_id',
        as: 'creatorDoc'
      }
    });
    pipeline.push({
      $addFields: {
        creatorEmail: { $ifNull: [{ $arrayElemAt: ['$creatorDoc.email', 0] }, ''] }
      }
    });

    // Lookup context - only need department
    pipeline.push({
      $lookup: {
        from: 'contexts',
        localField: 'interactions.context',
        foreignField: '_id',
        as: 'contextDoc'
      }
    });
    // Extract only department + program/action classification immediately
    pipeline.push({
      $addFields: {
        'interactions.department': { $ifNull: [{ $arrayElemAt: ['$contextDoc.department', 0] }, ''] },
        'interactions.program': { $ifNull: [{ $arrayElemAt: ['$contextDoc.program', 0] }, ''] },
        'interactions.action': { $ifNull: [{ $arrayElemAt: ['$contextDoc.action', 0] }, ''] }
      }
    });

    // Lookup expert feedback attached directly to the interaction
    pipeline.push({
      $lookup: {
        from: 'expertfeedbacks',
        localField: 'interactions.expertFeedback',
        foreignField: '_id',
        as: 'interactionExpertDocs'
      }
    });
    // Extract score fields for partnerEval computation + expertEmail
    pipeline.push({
      $addFields: {
        interactionExpert: {
          expertEmail: { $arrayElemAt: ['$interactionExpertDocs.expertEmail', 0] },
          overallRating: { $arrayElemAt: ['$interactionExpertDocs.overallRating', 0] }
        },
        hasInteractionExpert: { $gt: [{ $size: '$interactionExpertDocs' }, 0] },
        expertFeedbackData: getFeedbackDataProjection('$interactionExpertDocs', { includeContentIssue: true })
      }
    });

    // Lookup expert feedback attached to the auto eval
    pipeline.push({
      $lookup: {
        from: 'expertfeedbacks',
        localField: 'eval.expertFeedback',
        foreignField: '_id',
        as: 'evalExpertDocs'
      }
    });
    // Extract score fields for aiEval computation
    pipeline.push({
      $addFields: {
        evalExpert: {
          expertEmail: { $arrayElemAt: ['$evalExpertDocs.expertEmail', 0] }
        },
        autoEvalFeedbackData: getFeedbackDataProjection('$evalExpertDocs')
      }
    });

    // Lookup public feedback - only need whether feedback string is non-empty
    pipeline.push({
      $lookup: {
        from: 'publicfeedbacks',
        localField: 'interactions.publicFeedback',
        foreignField: '_id',
        as: 'publicFeedbackDoc'
      }
    });
    pipeline.push({
      $addFields: {
        feedbackValue: { $ifNull: [{ $arrayElemAt: ['$publicFeedbackDoc.feedback', 0] }, ''] }
      }
    });

    // Clean up temporary lookup arrays to free memory
    pipeline.push({
      $project: {
        answerDoc: 0,
        evalDoc: 0,
        creatorDoc: 0,
        contextDoc: 0,
        interactionExpertDocs: 0,
        evalExpertDocs: 0,
        answerToolIds: 0,
        answerToolDocs: 0,
        downloadTools: 0,
        downloadSucceededCount: 0,
        downloadTotalCount: 0,
        publicFeedbackDoc: 0
      }
    });

    // Compute partnerEval and aiEval - the *WithoutCitation variants, not
    // the plain shared helpers ChatDashboard/metrics/exports/eval-analysis
    // use, since Eval Dashboard shows citation as its own stacking pill
    // (below) instead of folding it into this base value. See the long
    // comment on getHasCitationErrorAggregationExpression in chat-filters.js
    // for why this dashboard gets a dedicated, non-shared variant rather
    // than changing what everyone else sees.
    pipeline.push({
      $addFields: {
        'interactions.partnerEval': getPartnerEvalAggregationExpressionWithoutCitation('$expertFeedbackData'),
        'interactions.aiEval': getAiEvalAggregationExpressionWithoutCitation('$autoEvalFeedbackData'),
        'interactions.partnerHasContentIssue': getPartnerContentIssueAggregationExpression('$expertFeedbackData'),
        // Citation correctness stacks alongside partnerEval/aiEval's own
        // correct/needsImprovement/hasError value rather than being folded
        // into it - see getHasCitationErrorAggregationExpression.
        'interactions.partnerHasCitationError': getHasCitationErrorAggregationExpression('$expertFeedbackData'),
        'interactions.aiHasCitationError': getHasCitationErrorAggregationExpression('$autoEvalFeedbackData')
      }
    });

    // Apply filters
    const andFilters = [];

    if (onlyEmpty === 'true' || onlyEmpty === '1') {
      // interactions without an autoEval
      andFilters.push({ 'interactions.autoEval': { $exists: false } });
      andFilters.push({ 'interactions.autoEval': null });
    }

    if (typeof processed !== 'undefined' && processed !== '') {
      // filter processed when eval exists
      if (processed === 'true' || processed === '1') {
        andFilters.push({ 'eval.processed': true });
      } else if (processed === 'false' || processed === '0') {
        andFilters.push({ $or: [{ 'eval.processed': false }, { eval: { $exists: false } }, { eval: null }] });
      }
    }

    if (noMatchReasonType) {
      const escaped = escapeRegex(noMatchReasonType);
      andFilters.push({ 'eval.noMatchReasonType': { $regex: `^${escaped}$`, $options: 'i' } });
    }

    if (fallbackType) {
      const escaped = escapeRegex(fallbackType);
      andFilters.push({ 'eval.fallbackType': { $regex: `^${escaped}$`, $options: 'i' } });
    }

    const sharedFilters = getChatFilterConditions({
      department,
      referringUrl,
      urlEn,
      urlFr,
      userType,
      answerType,
      partnerEval,
      aiEval,
      evalLogic
    }, { basePath: 'interactions', userField: 'user', citationErrorStacking: true });
    if (sharedFilters.length) {
      andFilters.push(...sharedFilters);
    }

    if (andFilters.length) pipeline.push({ $match: { $and: andFilters } });

    // NOTE: search must run after projection so we can match on the projected
    // top-level fields (chatId, pageLanguage, department, etc.). We'll add
    // the search match after the $project stage below.

    // Project fields for the UI
    pipeline.push({
      $project: {
        // include the human-facing interactionId (string) from the Interaction doc
        interactionId: { $ifNull: ['$interactions.interactionId', ''] },
        _id: '$interactions._id',
        createdAt: '$interactions.createdAt',
        chatCreatedAt: 1,  // Sort-stability tiebreaker only - see the first $project above
        chatId: 1,  // Already extracted at top level
        pageLanguage: 1,  // Already extracted at top level
        department: '$interactions.department',
        program: '$interactions.program',
        action: '$interactions.action',
        referringUrl: { $ifNull: ['$interactions.referringUrl', ''] },
        questionNumber: 1,
        // Indicate whether an auto-generated eval exists for this interaction
        hasAutoEval: { $cond: [{ $ifNull: ['$eval', false] }, true, false] },
        partnerEval: '$interactions.partnerEval',
        aiEval: '$interactions.aiEval',
        partnerHasContentIssue: { $ifNull: ['$interactions.partnerHasContentIssue', false] },
        partnerHasCitationError: { $ifNull: ['$interactions.partnerHasCitationError', false] },
        aiHasCitationError: { $ifNull: ['$interactions.aiHasCitationError', false] },
        // Only consider expert feedback attached directly to the interaction
        hasExpertEval: '$hasInteractionExpert',
        // Take the expert email from the interaction's expert feedback only
        expertEmail: { $ifNull: ['$interactionExpert.expertEmail', ''] },
        creatorEmail: { $ifNull: ['$creatorEmail', ''] },
        processed: '$eval.processed',
        hasMatches: '$eval.hasMatches',
        fallbackType: { $ifNull: ['$eval.fallbackType', ''] },
        noMatchReasonType: { $ifNull: ['$eval.noMatchReasonType', ''] },
        hasDownload: { $ifNull: ['$hasDownload', ''] },
        feedback: { $ifNull: ['$feedbackValue', ''] }
      }
    });

    // Apply search on the projected, top-level fields (so column names align)
    //
    // TODO: this OR-across-every-field substring match works well for the
    // free-text fields (department, program, emails, referringUrl, ...) but
    // is the wrong tool for feedback/hasDownload specifically - they're
    // short categorical values ('yes'/'no', 'success'/'partial'/'failed'),
    // and terms that short/common collide constantly with unrelated matches
    // in the other 11 fields (e.g. searching "yes" or "no" for the Public
    // column also matches "no" inside referring URLs, department/program
    // names, emails, etc., burying the rows you actually wanted). Splitting
    // the input on commas/spaces into multiple AND'd terms would NOT fix
    // this - "yes" would still match broadly everywhere else, you'd just be
    // narrowing around the noise with a second lucky term instead of
    // eliminating it. The real fix is giving feedback/hasDownload their own
    // exact-match dropdown filters in FilterPanel and dropping them out of
    // this free-text OR list entirely - categorical fields belong in
    // structured filters, not substring search. Not yet built.
    if (searchParam) {
      const esc = escapeRegex(searchParam);

      const orClauses = [
        { chatId: { $regex: esc, $options: 'i' } },
        { interactionId: { $regex: esc, $options: 'i' } },
        { department: { $regex: esc, $options: 'i' } },
        { program: { $regex: esc, $options: 'i' } },
        { action: { $regex: esc, $options: 'i' } },
        { pageLanguage: { $regex: esc, $options: 'i' } },
        { referringUrl: { $regex: esc, $options: 'i' } },
        { expertEmail: { $regex: esc, $options: 'i' } },
        { creatorEmail: { $regex: esc, $options: 'i' } },
        { fallbackType: { $regex: esc, $options: 'i' } },
        { noMatchReasonType: { $regex: esc, $options: 'i' } },
        // feedback (Public column) stores the literal string 'yes'/'no', so
        // this text match alone already finds exactly those rows - no
        // separate boolean interpretation needed for it.
        { feedback: { $regex: esc, $options: 'i' } },
        // hasDownload is a status string now, not a boolean, so it's a text match
        { hasDownload: { $regex: esc, $options: 'i' } }
      ];

      // A previous version of this also OR'd in a literal-boolean
      // interpretation of "yes"/"no"/"true"/"false" against hasAutoEval,
      // hasExpertEval, processed, hasMatches, and hasDownload (mapped to
      // {$in:['fail','']}). That looked like a convenience ("let 'no' find
      // download failures too"), but those fields are false/blank for most
      // rows (most questions aren't expert-reviewed, most have no download
      // attempt at all), so OR-ing any of them in matched nearly every row
      // in the table - typing "no" to find Public feedback = No returned
      // almost all chats instead. Removed: those four fields already have
      // their own dedicated filter dropdowns in the filter panel, and the
      // plain text clauses above already match feedback/hasDownload's own
      // literal stored values precisely.
      pipeline.push({ $match: { $or: orClauses } });
    }

    // Handle per-column searches from frontend
    let columnSearch = req.query.columnSearch || null;
    if (typeof columnSearch === 'string' && columnSearch.trim()) {
      try {
        columnSearch = JSON.parse(columnSearch);
      } catch (err) {
        console.warn('Failed to parse columnSearch filter', err);
        columnSearch = null;
      }
    }
    // Columns that hold a status string rather than a real boolean - never
    // coerce their search value to true/false, always fall through to the
    // regex/text branch below.
    const stringStatusColumns = new Set(['hasDownload']);
    if (columnSearch && typeof columnSearch === 'object' && Object.keys(columnSearch).length) {
      const andClauses = [];
      for (const [col, val] of Object.entries(columnSearch)) {
        const v = String(val || '').trim();
        if (!v) continue;
        const low = v.toLowerCase();
        if (!stringStatusColumns.has(col) && ['true', 'false', '1', '0', 'yes', 'no', 'y', 'n'].includes(low)) {
          const boolVal = ['true', '1', 'yes', 'y'].includes(low);
          andClauses.push({ [col]: boolVal });
        } else {
          andClauses.push({ [col]: { $regex: escapeRegex(v), $options: 'i' } });
        }
      }
      if (andClauses.length) pipeline.push({ $match: { $and: andClauses } });
    }

    // Sorting
    const sortFieldMap = {
      createdAt: 'createdAt',
      chatId: 'chatId',
      questionNumber: 'questionNumber',
      department: 'department',
      program: 'program',
      action: 'action',
      referringUrl: 'referringUrl',
      pageLanguage: 'pageLanguage',
      partnerEval: 'partnerEval',
      aiEval: 'aiEval',
      fallbackType: 'fallbackType',
      noMatchReasonType: 'noMatchReasonType',
      creatorEmail: 'creatorEmail',
      expertEmail: 'expertEmail',
      hasDownload: 'hasDownload',
      feedback: 'feedback'
    };
    const sortField = sortFieldMap[orderBy] || 'createdAt';
    // Same chat-clustering tiebreaker as chat-dashboard.js's sortStage (see
    // its comment for the full reasoning) - the UI groups a multi-turn
    // chat's rows together visually (rowspan'd Chat ID/Department/Program
    // cells), which only looks right if those rows are actually adjacent in
    // whatever order the table is currently sorted by. `_id` (the
    // interaction's own id) as the sole tiebreaker doesn't guarantee that:
    // two interactions from different chats can easily land next to each
    // other. `chatCreatedAt` (the chat's own constant createdAt, not the
    // per-interaction one used for the Date column) plus chatId plus
    // questionNumber together always cluster a chat's rows adjacent, in
    // question order, regardless of which column is the primary sort - the
    // 'createdAt'/Date case additionally swaps the *primary* key to the
    // chat-level date for the same reason (each question in a chat has its
    // own distinct timestamp, so sorting by the interaction's own date would
    // scatter a chat's rows even with these as secondary tiebreakers).
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
    // per-question field (Department/Program/Action/Feedback/Download) is
    // deliberately scoped to individual interactions, not whole chats -
    // "sort by Download = failed" means show me the failed downloads, not
    // every other question in the same conversation dragged along with
    // them, same as how a search match doesn't pull in its chat's
    // unrelated siblings either. So those sorts fall back to plain
    // row-based pagination below, and a chat's rows can end up apart from
    // each other (or split across a page) in that mode - that's correct
    // there, not the bug this feature exists to prevent.
    const useChatGroupedPagination = isDataTablesMode && sortField === 'createdAt';

    if (useChatGroupedPagination) {
      // Deliberately ONE continuous aggregation (group -> sort -> skip/
      // limit AT THE GROUP LEVEL -> unwind back to rows) instead of a
      // separate windowing query + a second fetch for that page's chatIds:
      // this endpoint's $lookup joins (answers/tools/evals/users/contexts/
      // publicfeedbacks - see above) are the expensive part, and a
      // two-query version would have run all of them twice per page load.
      // This way they still run exactly once, same as before this feature
      // (see the "calls aggregate exactly once, not twice" test) -
      // grouping/sorting/windowing then happens in-memory (allowDiskUse if
      // needed) on the already-joined, already-filtered stream instead of
      // hitting the DB again. No $setWindowFields (row_number/rank) to
      // derive each chat's sort position either - see
      // project_eval_dashboard_perf.md's history with that operator on
      // DocumentDB - $first after the row-level $sort above captures the
      // correct group-representative value instead.
      //
      // TODO: if this turns out to cost more than expected in practice
      // (real DocumentDB, not local dev) - the $group/$push holds every
      // matching row for the WHOLE filtered result set in memory/disk-
      // spill before it can skip/limit at the group level, not just one
      // page's worth, which is a real cost this environment may not have
      // headroom for - it's fine to strip this back out for Eval Dashboard
      // specifically (revert to the plain row-based $skip/$limit below)
      // and revisit later rather than live with a slow dashboard. Chat
      // Dashboard has the equivalent TODO in api/chat/chat-dashboard.js.
      pipeline.push({ $group: { _id: '$chatId', sortKeyValue: { $first: '$chatCreatedAt' }, rows: { $push: '$$ROOT' } } });
      pipeline.push({ $sort: { sortKeyValue: orderDir, _id: orderDir } });
      if (start > 0) pipeline.push({ $skip: start });
      // +1 group (not +1 row) so JS below can detect hasMore and trim the
      // lookahead chat's rows back off, without a second query.
      pipeline.push({ $limit: Math.min(pageSize + 1, 2001) });
      pipeline.push({ $unwind: '$rows' });
      pipeline.push({ $replaceRoot: { newRoot: '$rows' } });
    } else if (isDataTablesMode) {
      if (start > 0) pipeline.push({ $skip: start });
      pipeline.push({ $limit: Math.min(pageSize + 1, 2001) });
    }

    const flatRows = await Chat.aggregate(pipeline).allowDiskUse(true);

    let rows = flatRows;
    let hasMore = false;
    if (useChatGroupedPagination) {
      const seenChatIds = [];
      for (const r of flatRows) {
        if (seenChatIds[seenChatIds.length - 1] !== r.chatId) seenChatIds.push(r.chatId);
      }
      if (seenChatIds.length > pageSize) {
        hasMore = true;
        const lookaheadChatId = seenChatIds[pageSize];
        rows = flatRows.filter((r) => r.chatId !== lookaheadChatId);
      }
    } else if (isDataTablesMode && pageSize !== null) {
      hasMore = flatRows.length > pageSize;
      rows = flatRows.slice(0, pageSize);
    }

    const mappedRows = rows.map((r) => ({
      _id: r._id ? String(r._id) : '',
      interactionId: r.interactionId || (r._id ? String(r._id) : ''),
      questionNumber: r.questionNumber || 0,
      chatId: r.chatId || '',
      department: r.department || '',
      program: r.program || '',
      action: r.action || '',
      // Display-only French labels; program/action stay canonical English for
      // search/sort. UI picks by lang, falling back to English when unmapped.
      programFr: frForProgram(r.program),
      actionFr: frForAction(r.action),
      referringUrl: r.referringUrl || '',
      pageLanguage: r.pageLanguage || '',
      hasAutoEval: !!r.hasAutoEval,
      hasExpertEval: !!r.hasExpertEval,
      partnerEval: r.partnerEval || '',
      aiEval: r.aiEval || '',
      partnerHasContentIssue: !!r.partnerHasContentIssue,
      partnerHasCitationError: !!r.partnerHasCitationError,
      aiHasCitationError: !!r.aiHasCitationError,
      expertEmail: r.expertEmail || '',
      creatorEmail: r.creatorEmail || '',
      processed: typeof r.processed === 'boolean' ? r.processed : false,
      hasMatches: typeof r.hasMatches === 'boolean' ? r.hasMatches : false,
      fallbackType: r.fallbackType || '',
      noMatchReasonType: r.noMatchReasonType || '',
      hasDownload: r.hasDownload || '',
      feedback: r.feedback || '',
      date: r.createdAt ? r.createdAt.toISOString() : null
    }));

    if (isDataTablesMode) {
      const draw = Number.isFinite(parseInt(drawParam, 10)) ? parseInt(drawParam, 10) : 0;
      return res.status(200).json({ draw, hasMore, data: mappedRows });
    }

    const nextLastId = mappedRows.length > 0 ? mappedRows[mappedRows.length - 1]._id : null;
    return res.status(200).json({ success: true, rows: mappedRows, lastId: nextLastId, hasMore });
  } catch (err) {
    console.error('Failed to fetch eval dashboard data', err);
    return res.status(500).json({ error: 'Failed to fetch eval dashboard data', details: err.message });
  }
}

export default withProtection(
  evalDashboardHandler,
  authMiddleware,
  partnerOrAdminMiddleware
);
