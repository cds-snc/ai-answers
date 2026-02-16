import dbConnect from '../db/db-connect.js';
import { Interaction } from '../../models/interaction.js';
import { Chat } from '../../models/chat.js';
import { withProtection, authMiddleware, partnerOrAdminMiddleware } from '../../middleware/auth.js';
import mongoose from 'mongoose';
import { getChatFilterConditions } from '../util/chat-filters.js';

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
      aiEval = ''
    } = req.query;

    const dateRange = getDateRange({ startDate, endDate, filterType, presetValue });
    const start = Number.isFinite(parseInt(startParam, 10)) ? parseInt(startParam, 10) : 0;
    const length = Number.isFinite(parseInt(lengthParam, 10)) ? parseInt(lengthParam, 10) : null;
    const isDataTablesMode = length !== null;
    const orderBy = orderByParam || 'createdAt';
    const orderDir = (orderDirParam || 'desc').toLowerCase() === 'asc' ? 1 : -1;

    const pipeline = [];
    const initialMatch = {};
    if (dateRange) initialMatch.createdAt = dateRange;

    if (Object.keys(initialMatch).length) pipeline.push({ $match: initialMatch });

    // Lookup answer - only need answerType
    pipeline.push({
      $lookup: {
        from: 'answers',
        localField: 'answer',
        foreignField: '_id',
        as: 'answerDoc'
      }
    });
    // Extract only answerType immediately
    pipeline.push({
      $addFields: {
        answerType: { $ifNull: [{ $arrayElemAt: ['$answerDoc.answerType', 0] }, ''] }
      }
    });

    // Lookup eval - only need processed, hasMatches, fallbackType, noMatchReasonType, expertFeedback ref
    pipeline.push({
      $lookup: {
        from: 'evals',
        localField: 'autoEval',
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

    // Lookup parent chat - only need chatId, pageLanguage, user
    pipeline.push({
      $lookup: {
        from: 'chats',
        localField: '_id',
        foreignField: 'interactions',
        as: 'chatDoc'
      }
    });
    // Extract only needed fields immediately
    pipeline.push({
      $addFields: {
        chatId: { $ifNull: [{ $arrayElemAt: ['$chatDoc.chatId', 0] }, ''] },
        pageLanguage: { $ifNull: [{ $arrayElemAt: ['$chatDoc.pageLanguage', 0] }, ''] },
        chatUser: { $arrayElemAt: ['$chatDoc.user', 0] },
        questionNumber: {
          $add: [
            { $indexOfArray: [{ $ifNull: [{ $arrayElemAt: ['$chatDoc.interactions', 0] }, []] }, '$_id'] },
            1
          ]
        }
      }
    });

    // Lookup context - only need department
    pipeline.push({
      $lookup: {
        from: 'contexts',
        localField: 'context',
        foreignField: '_id',
        as: 'contextDoc'
      }
    });
    // Extract only department immediately
    pipeline.push({
      $addFields: {
        department: { $ifNull: [{ $arrayElemAt: ['$contextDoc.department', 0] }, ''] }
      }
    });

    // Lookup expert feedback attached directly to the interaction - only need expertEmail, overallRating
    pipeline.push({
      $lookup: {
        from: 'expertfeedbacks',
        localField: 'expertFeedback',
        foreignField: '_id',
        as: 'interactionExpertDocs'
      }
    });
    // Extract only needed fields immediately
    pipeline.push({
      $addFields: {
        interactionExpert: {
          expertEmail: { $arrayElemAt: ['$interactionExpertDocs.expertEmail', 0] },
          overallRating: { $arrayElemAt: ['$interactionExpertDocs.overallRating', 0] }
        },
        hasInteractionExpert: { $gt: [{ $size: '$interactionExpertDocs' }, 0] }
      }
    });

    // Lookup expert feedback attached to the auto eval - only need expertEmail
    pipeline.push({
      $lookup: {
        from: 'expertfeedbacks',
        localField: 'eval.expertFeedback',
        foreignField: '_id',
        as: 'evalExpertDocs'
      }
    });
    // Extract only needed fields immediately
    pipeline.push({
      $addFields: {
        evalExpert: {
          expertEmail: { $arrayElemAt: ['$evalExpertDocs.expertEmail', 0] }
        }
      }
    });

    // Clean up temporary lookup arrays to free memory
    pipeline.push({
      $project: {
        answerDoc: 0,
        evalDoc: 0,
        chatDoc: 0,
        contextDoc: 0,
        interactionExpertDocs: 0,
        evalExpertDocs: 0
      }
    });

    pipeline.push({
      $addFields: {
        partnerEval: {
          $switch: {
            branches: [
              { case: { $eq: ['$interactionExpert.overallRating', 'correct'] }, then: 'correct' },
              { case: { $eq: ['$interactionExpert.overallRating', 'incorrect'] }, then: 'incorrect' },
              { case: { $eq: ['$interactionExpert.overallRating', 'needsImprovement'] }, then: 'needsImprovement' }
            ],
            default: {
              $cond: {
                if: { $ifNull: ['$interactionExpert', false] },
                then: 'other',
                else: 'none'
              }
            }
          }
        },
        aiEval: {
          $switch: {
            branches: [
              { case: { $eq: ['$eval.hasMatches', false] }, then: 'noMatch' },
              { case: { $ne: ['$eval.fallbackType', null] }, then: 'fallback' },
              { case: { $eq: ['$eval.hasCitationError', true] }, then: 'hasCitationError' },
              { case: { $eq: ['$eval.hasError', true] }, then: 'hasError' }
            ],
            default: {
              $cond: {
                if: { $ifNull: ['$eval', false] },
                then: 'normal',
                else: 'none'
              }
            }
          }
        }
      }
    });

    // Apply filters
    const andFilters = [];

    if (onlyEmpty === 'true' || onlyEmpty === '1') {
      // interactions without an autoEval
      andFilters.push({ autoEval: { $exists: false } });
      andFilters.push({ autoEval: null });
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
      answerType,
      partnerEval,
      aiEval
    }, { basePath: '' });
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
        interactionId: { $ifNull: ['$interactionId', ''] },
        _id: 1,
        createdAt: 1,
        chatId: 1,  // Already extracted at top level
        pageLanguage: 1,  // Already extracted at top level
        department: 1,  // Already extracted at top level
        referringUrl: { $ifNull: ['$referringUrl', ''] },
        questionNumber: 1,
        // Indicate whether an auto-generated eval exists for this interaction
        hasAutoEval: { $cond: [{ $ifNull: ['$eval', false] }, true, false] },
        partnerEval: 1,
        aiEval: 1,
        // Only consider expert feedback attached directly to the interaction
        hasExpertEval: '$hasInteractionExpert',
        // Take the expert email from the interaction's expert feedback only
        expertEmail: { $ifNull: ['$interactionExpert.expertEmail', ''] },
        processed: '$eval.processed',
        hasMatches: '$eval.hasMatches',
        fallbackType: { $ifNull: ['$eval.fallbackType', ''] },
        noMatchReasonType: { $ifNull: ['$eval.noMatchReasonType', ''] }
      }
    });

    // Apply search on the projected, top-level fields (so column names align)
    if (searchParam) {
      const esc = escapeRegex(searchParam);
      const norm = String(searchParam).trim().toLowerCase();
      // Interpret common boolean search terms
      let boolSearch = null;
      if (['yes', 'true', '1', 'y'].includes(norm)) boolSearch = true;
      else if (['no', 'false', '0', 'n'].includes(norm)) boolSearch = false;

      const orClauses = [
        { chatId: { $regex: esc, $options: 'i' } },
        { interactionId: { $regex: esc, $options: 'i' } },
        { department: { $regex: esc, $options: 'i' } },
        { pageLanguage: { $regex: esc, $options: 'i' } },
        { expertEmail: { $regex: esc, $options: 'i' } },
        { fallbackType: { $regex: esc, $options: 'i' } },
        { noMatchReasonType: { $regex: esc, $options: 'i' } }
      ];

      // If the user searched a boolean-like term, also match boolean columns directly
      if (boolSearch !== null) {
        orClauses.push({ hasAutoEval: boolSearch });
        orClauses.push({ hasExpertEval: boolSearch });
        orClauses.push({ processed: boolSearch });
        orClauses.push({ hasMatches: boolSearch });
      }

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
    if (columnSearch && typeof columnSearch === 'object' && Object.keys(columnSearch).length) {
      const andClauses = [];
      for (const [col, val] of Object.entries(columnSearch)) {
        const v = String(val || '').trim();
        if (!v) continue;
        const low = v.toLowerCase();
        if (['true', 'false', '1', '0', 'yes', 'no', 'y', 'n'].includes(low)) {
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
      referringUrl: 'referringUrl',
      pageLanguage: 'pageLanguage',
      partnerEval: 'partnerEval',
      aiEval: 'aiEval',
      fallbackType: 'fallbackType',
      noMatchReasonType: 'noMatchReasonType'
    };
    const sortField = sortFieldMap[orderBy] || 'createdAt';
    const sortStage = { $sort: { [sortField]: orderDir, _id: orderDir } };
    pipeline.push(sortStage);

    if (isDataTablesMode) {
      if (start > 0) pipeline.push({ $skip: start });
      pipeline.push({ $limit: Math.min(Math.max(length, 1), 2000) });
    }

    const results = await Interaction.aggregate(pipeline).allowDiskUse(true);

    // For records count, use a copy of pipeline up to project then count
    const countPipeline = pipeline.slice(0, Math.max(0, pipeline.findIndex(s => s.$sort !== undefined))).filter(Boolean);
    // if pipeline had skip/limit, remove them for counting
    const filteredCountPipeline = [];
    for (const stage of countPipeline) {
      if (stage.$skip || stage.$limit || stage.$sort) continue;
      filteredCountPipeline.push(stage);
    }
    // Append count
    filteredCountPipeline.push({ $count: 'totalCount' });
    const countResult = filteredCountPipeline.length ? await Interaction.aggregate(filteredCountPipeline).allowDiskUse(true) : [];
    const totalCount = (countResult && countResult[0] && countResult[0].totalCount) || 0;

    const rows = results.map((r) => ({
      _id: r._id ? String(r._id) : '',
      interactionId: r.interactionId || (r._id ? String(r._id) : ''),
      questionNumber: r.questionNumber || 0,
      chatId: r.chatId || '',
      department: r.department || '',
      referringUrl: r.referringUrl || '',
      pageLanguage: r.pageLanguage || '',
      hasAutoEval: !!r.hasAutoEval,
      hasExpertEval: !!r.hasExpertEval,
      partnerEval: r.partnerEval || '',
      aiEval: r.aiEval || '',
      expertEmail: r.expertEmail || '',
      processed: typeof r.processed === 'boolean' ? r.processed : false,
      hasMatches: typeof r.hasMatches === 'boolean' ? r.hasMatches : false,
      fallbackType: r.fallbackType || '',
      noMatchReasonType: r.noMatchReasonType || '',
      date: r.createdAt ? r.createdAt.toISOString() : null
    }));

    if (isDataTablesMode) {
      const draw = Number.isFinite(parseInt(drawParam, 10)) ? parseInt(drawParam, 10) : 0;
      return res.status(200).json({ draw, recordsTotal: totalCount, recordsFiltered: totalCount, data: rows });
    }

    const nextLastId = rows.length > 0 ? rows[rows.length - 1]._id : null;
    return res.status(200).json({ success: true, rows, lastId: nextLastId, totalCount });
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
