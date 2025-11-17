import dbConnect from '../db/db-connect.js';
import { Interaction } from '../../models/interaction.js';
import { Chat } from '../../models/chat.js';
import { withUser, withProtection, authMiddleware, partnerOrAdminMiddleware } from '../../middleware/auth.js';
import mongoose from 'mongoose';

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
      processed
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

    // Lookup eval via autoEval
    pipeline.push({
      $lookup: {
        from: 'evals',
        localField: 'autoEval',
        foreignField: '_id',
        as: 'evalDoc'
      }
    });
    pipeline.push({ $addFields: { eval: { $arrayElemAt: ['$evalDoc', 0] } } });

    // Lookup parent chat (chat that contains this interaction)
    pipeline.push({
      $lookup: {
        from: 'chats',
        localField: '_id',
        foreignField: 'interactions',
        as: 'chatDoc'
      }
    });
    pipeline.push({ $addFields: { chat: { $arrayElemAt: ['$chatDoc', 0] } } });

    // Lookup context for department
    pipeline.push({
      $lookup: {
        from: 'contexts',
        localField: 'context',
        foreignField: '_id',
        as: 'contextDoc'
      }
    });
    pipeline.push({ $addFields: { context: { $arrayElemAt: ['$contextDoc', 0] } } });

    // Lookup expert feedback attached directly to the interaction (if any)
    pipeline.push({
      $lookup: {
        from: 'expertfeedbacks',
        localField: 'expertFeedback',
        foreignField: '_id',
        as: 'interactionExpertDocs'
      }
    });
    pipeline.push({ $addFields: { interactionExpert: { $arrayElemAt: ['$interactionExpertDocs', 0] } } });

    // Lookup expert feedback attached to the auto eval (if any)
    pipeline.push({
      $lookup: {
        from: 'expertfeedbacks',
        localField: 'eval.expertFeedback',
        foreignField: '_id',
        as: 'evalExpertDocs'
      }
    });
    pipeline.push({ $addFields: { evalExpert: { $arrayElemAt: ['$evalExpertDocs', 0] } } });

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

    if (andFilters.length) pipeline.push({ $match: { $and: andFilters } });

    // Apply search on chatId or interactionId
    if (searchParam) {
      const esc = escapeRegex(searchParam);
      pipeline.push({ $match: { $or: [ { 'chat.chatId': { $regex: esc, $options: 'i' } }, { interactionId: { $regex: esc, $options: 'i' } } ] } });
    }

    // Project fields for the UI
    pipeline.push({
      $project: {
        // include the human-facing interactionId (string) from the Interaction doc
        interactionId: { $ifNull: ['$interactionId', ''] },
        _id: 1,
        createdAt: 1,
        chatId: { $ifNull: ['$chat.chatId', ''] },
        pageLanguage: { $ifNull: ['$chat.pageLanguage', ''] },
        department: { $ifNull: ['$context.department', ''] },
        // Indicate whether an auto-generated eval exists for this interaction
        hasAutoEval: { $cond: [{ $ifNull: ['$eval', false] }, true, false] },
        // Only consider expert feedback attached directly to the interaction
        // (do NOT count expert feedback that is only referenced from the Eval document)
        hasExpertEval: { $cond: [{ $ifNull: ['$interactionExpert', false] }, true, false] },
        // Take the expert email from the interaction's expert feedback only
        expertEmail: { $ifNull: ['$interactionExpert.expertEmail', ''] },
        evalProcessed: '$eval.processed',
        evalHasMatches: '$eval.hasMatches',
        fallbackType: { $ifNull: ['$eval.fallbackType', ''] },
        noMatchReasonType: { $ifNull: ['$eval.noMatchReasonType', ''] }
      }
    });

    // Sorting
    const sortFieldMap = {
      createdAt: 'createdAt',
      chatId: 'chatId',
      department: 'department',
      pageLanguage: 'pageLanguage',
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
      chatId: r.chatId || '',
      department: r.department || '',
      pageLanguage: r.pageLanguage || '',
      hasAutoEval: !!r.hasAutoEval,
      hasExpertEval: !!r.hasExpertEval,
      expertEmail: r.expertEmail || '',
      processed: typeof r.evalProcessed === 'boolean' ? r.evalProcessed : false,
      hasMatches: typeof r.evalHasMatches === 'boolean' ? r.evalHasMatches : false,
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

export default function handler(req, res) {
  return withProtection(
    evalDashboardHandler,
    authMiddleware,
    partnerOrAdminMiddleware
  )(req, res);
}
