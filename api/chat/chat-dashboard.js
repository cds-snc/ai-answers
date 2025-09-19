import dbConnect from '../db/db-connect.js';
import { Chat } from '../../models/chat.js';
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
      startDate,
      endDate,
      filterType,
      presetValue,
      limit: limitParam
    } = req.query;

    const dateRange = getDateRange({ startDate, endDate, filterType, presetValue });
    const limit = Math.min(Math.max(parseInt(limitParam, 10) || 500, 1), 2000);

    const pipeline = [];

    if (dateRange) {
      pipeline.push({ $match: { createdAt: dateRange } });
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

    pipeline.push({ $project: { interactionContext: 0 } });

    const andFilters = [];
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

    pipeline.push({
      $group: {
        _id: '$_id',
        chatId: { $first: '$chatId' },
        createdAt: { $first: '$createdAt' },
        departments: {
          $addToSet: '$interactions.context.department'
        }
      }
    });

    pipeline.push({
      $project: {
        _id: 0,
        chatId: 1,
        createdAt: 1,
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
        }
      }
    });

    pipeline.push({ $sort: { createdAt: -1 } });
    pipeline.push({ $limit: limit });

    const results = await Chat.aggregate(pipeline).allowDiskUse(true);

    const chats = results.map((chat) => ({
      chatId: chat.chatId || '',
      department: chat.department || '',
      date: chat.createdAt ? chat.createdAt.toISOString() : null
    }));

    return res.status(200).json({ chats });
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
