import dbConnect from '../db/db-connect.js';
import { Chat } from '../../models/chat.js';
import mongoose from 'mongoose';
import { authMiddleware, partnerOrAdminMiddleware, withProtection } from '../../middleware/auth.js';

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
    if (presetValue === 'all') {
      return null;
    }
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
      startDate,
      endDate,
      filterType,
      presetValue,
      limit: limitParam,
      lastId: lastIdParam,
      start: startParam,
      length: lengthParam,
      orderBy: orderByParam,
      orderDir: orderDirParam,
      draw: drawParam,
      search: searchParam
    } = req.query;

    const dateRange = getDateRange({ startDate, endDate, filterType, presetValue });
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
        // For descending sort, get documents with _id < lastId
        initialMatch._id = { $lt: lastId };
      } catch (err) {
        return res.status(400).json({ error: 'Invalid lastId' });
      }
    }

    if (Object.keys(initialMatch).length) {
      pipeline.push({ $match: initialMatch });
    }

    pipeline.push({
      $lookup: {
        from: 'interactions',
        localField: 'interactions',
        foreignField: '_id',
        as: 'interactions'
      }
    });

    pipeline.push({
      $unwind: {
        path: '$interactions',
        preserveNullAndEmptyArrays: true
      }
    });

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
        'interactions.context': { $arrayElemAt: ['$interactionContext', 0] }
      }
    });

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
        'interactions.expertEmail': {
          $ifNull: [
            { $arrayElemAt: ['$expertFeedbackDocs.expertEmail', 0] },
            ''
          ]
        }
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

  pipeline.push({ $project: { interactionContext: 0, expertFeedbackDocs: 0 } });

    const andFilters = [];

    // Filter by userType if specified
    if (userType === 'public') {
      // Public users: creatorEmail is null, empty, or doesn't exist
      andFilters.push({
        $or: [
          { creatorEmail: { $exists: false } },
          { creatorEmail: null },
          { creatorEmail: '' }
        ]
      });
    } else if (userType === 'admin') {
      // Admin users: creatorEmail exists and is not empty
      andFilters.push({
        creatorEmail: { $exists: true, $ne: '', $ne: null }
      });
    }
    // If userType === 'all' or undefined, no additional filtering

    if (department) {
      const escapedDepartment = escapeRegex(department);
      andFilters.push({
        'interactions.context.department': {
          $regex: escapedDepartment,
          $options: 'i'
        }
      });
    }

    if (referringUrl) {
      const escapedRef = escapeRegex(referringUrl);
      andFilters.push({
        'interactions.referringUrl': {
          $regex: escapedRef,
          $options: 'i'
        }
      });
    }

    if (andFilters.length) {
      pipeline.push({ $match: { $and: andFilters } });
    }

    // Handle search parameter for chatId (after grouping, so applied separately)
    const searchFilter = searchParam ? { chatId: { $regex: escapeRegex(searchParam), $options: 'i' } } : null;

    pipeline.push({
      $group: {
        _id: '$_id',
        chatId: { $first: '$chatId' },
        createdAt: { $first: '$createdAt' },
        creatorEmail: { $first: '$creatorEmail' },
        departments: {
          $addToSet: '$interactions.context.department'
        },
        expertEmails: {
          $addToSet: '$interactions.expertEmail'
        }
      }
    });

    pipeline.push({
      $project: {
        // keep _id so we can use it as a cursor for pagination
        chatId: 1,
        createdAt: 1,
        creatorEmail: 1,
        department: {
          $let: {
            vars: {
              filtered: {
                $filter: {
                  input: '$departments',
                  as: 'dept',
                  cond: {
                    $and: [
                      { $ne: ['$$dept', null] },
                      { $ne: ['$$dept', ''] }
                    ]
                  }
                }
              }
            },
            in: {
              $cond: [
                { $gt: [{ $size: '$$filtered' }, 0] },
                { $arrayElemAt: ['$$filtered', 0] },
                ''
              ]
            }
          }
        },
        expertEmail: {
          $let: {
            vars: {
              filteredEmails: {
                $filter: {
                  input: '$expertEmails',
                  as: 'email',
                  cond: {
                    $and: [
                      { $ne: ['$$email', null] },
                      { $ne: ['$$email', ''] }
                    ]
                  }
                }
              }
            },
            in: {
              $cond: [
                { $gt: [{ $size: '$$filteredEmails' }, 0] },
                { $arrayElemAt: ['$$filteredEmails', 0] },
                ''
              ]
            }
          }
        }
      }
    });


    // Apply search filter if present (after $project stage)
    if (searchFilter) {
      pipeline.push({ $match: searchFilter });
    }

    // Keep a copy of pipeline before adding sort/limit to calculate totalCount
    const pipelineBeforeSortLimit = pipeline.slice();

    // Dynamic sort mapping
    const sortFieldMap = {
      createdAt: 'createdAt',
      chatId: 'chatId',
      department: 'department',
      expertEmail: 'expertEmail',
      creatorEmail: 'creatorEmail'
    };
    const sortField = sortFieldMap[orderBy] || 'createdAt';
    const sortStage = { $sort: { [sortField]: orderDir, _id: orderDir } };
    pipeline.push(sortStage);

    if (isDataTablesMode) {
      if (start > 0) pipeline.push({ $skip: start });
      pipeline.push({ $limit: Math.min(Math.max(length, 1), 2000) });
    } else {
      pipeline.push({ $limit: limit });
    }

  const results = await Chat.aggregate(pipeline).allowDiskUse(true);

    // Calculate totalCount using a count aggregation that mirrors the pipeline up to grouping/project
  const countPipeline = pipelineBeforeSortLimit.slice();
  countPipeline.push({ $group: { _id: '$_id' } });
  countPipeline.push({ $count: 'totalCount' });
    const countResult = await Chat.aggregate(countPipeline).allowDiskUse(true);
    const totalCount = (countResult && countResult[0] && countResult[0].totalCount) || 0;

    const chats = results.map((chat) => ({
      _id: chat._id ? String(chat._id) : '',
      chatId: chat.chatId || '',
      department: chat.department || '',
      expertEmail: chat.expertEmail || '',
      creatorEmail: chat.creatorEmail || '',
      date: chat.createdAt ? chat.createdAt.toISOString() : null
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
