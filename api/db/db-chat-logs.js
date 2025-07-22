// chat-logs-docdb.js

import dbConnect from './db-connect.js';
import { Chat } from '../../models/chat.js';
import {
  authMiddleware,
  adminMiddleware,
  withProtection
} from '../../middleware/auth.js';

async function chatLogsHandler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    await dbConnect();
    const {
      days, startDate, endDate,
      filterType, presetValue,
      department, referringUrl,
      limit, offset,
      export: isExport
    } = req.query;

    // Parse pagination parameters - if export=true, skip pagination
    const usePagination = !isExport && (limit !== undefined || offset !== undefined);
    const pageLimit = usePagination ? (parseInt(limit) || 50) : null;
    const pageOffset = usePagination ? (parseInt(offset) || 0) : null;

    const dateFilter = {};
    if (startDate && endDate) {
      dateFilter.createdAt = { $gte: new Date(startDate), $lte: new Date(endDate) };
    } else if (filterType === 'preset' && presetValue !== 'all') {
      const hours = parseInt(presetValue) * 24;
      const end = new Date(), start = new Date(end.getTime() - hours * 3600_000);
      dateFilter.createdAt = { $gte: start, $lte: end };
    } else if (days && days !== 'all') {
      const n = parseInt(days) || 1;
      const dt = new Date();
      dt.setDate(dt.getDate() - n);
      dateFilter.createdAt = { $gte: dt };
    }

    // Export populate - same as UI populate to ensure ALL data is exported
    const exportPopulate = [
      { path: 'user', select: 'email' },
      {
        path: 'interactions',
        populate: [
          { path: 'context' },
          { path: 'expertFeedback', model: 'ExpertFeedback', select: '-__v' },
          { path: 'publicFeedback', model: 'PublicFeedback', select: '-__v' },
          { path: 'question', select: '-embedding' },
          {
            path: 'answer',
            select: '-embedding -sentenceEmbeddings',
            populate: [
              { path: 'sentences' },
              { path: 'citation' },
              { path: 'tools' }
            ]
          },
          {
            path: 'autoEval',
            model: 'Eval',
            populate: {
              path: 'expertFeedback',
              model: 'ExpertFeedback',
              select: '-__v'
            }
          }
        ]
      }
    ];

    // Full populate for UI - includes all nested data
    const chatPopulate = [
      { path: 'user', select: 'email' },
      {
        path: 'interactions',
        populate: [
          { path: 'context' },
          { path: 'expertFeedback', model: 'ExpertFeedback', select: '-__v' },
          { path: 'publicFeedback', model: 'PublicFeedback', select: '-__v' },
          { path: 'question', select: '-embedding' },
          {
            path: 'answer',
            select: '-embedding -sentenceEmbeddings',
            populate: [
              { path: 'sentences' },
              { path: 'citation' },
              { path: 'tools' }
            ]
          },
          {
            path: 'autoEval',
            model: 'Eval',
            populate: {
              path: 'expertFeedback',
              model: 'ExpertFeedback',
              select: '-__v'
            }
          }
        ]
      }
    ];

    // Choose populate configuration based on export flag
    const populateConfig = isExport ? exportPopulate : chatPopulate;

    let chats;
    let totalCount = 0;

    if (department || referringUrl) {
      const pipeline = [];
      if (Object.keys(dateFilter).length) pipeline.push({ $match: dateFilter });

      pipeline.push({
        $lookup: {
          from: 'interactions',
          localField: 'interactions',
          foreignField: '_id',
          as: 'interactions'
        }
      });

      pipeline.push({ $unwind: '$interactions' });

      pipeline.push({
        $lookup: {
          from: 'contexts',
          localField: 'interactions.context',
          foreignField: '_id',
          as: 'interactions.context_doc'
        }
      });

      pipeline.push({
        $addFields: {
          'interactions.context': { $arrayElemAt: ['$interactions.context_doc', 0] }
        }
      });

      // Add lookups for other interaction fields
      pipeline.push({
        $lookup: {
          from: 'expertfeedbacks',
          localField: 'interactions.expertFeedback',
          foreignField: '_id',
          as: 'interactions.expertFeedback_doc'
        }
      });

      pipeline.push({
        $lookup: {
          from: 'publicfeedbacks',
          localField: 'interactions.publicFeedback',
          foreignField: '_id',
          as: 'interactions.publicFeedback_doc'
        }
      });

      pipeline.push({
        $lookup: {
          from: 'questions',
          localField: 'interactions.question',
          foreignField: '_id',
          as: 'interactions.question_doc'
        }
      });

      pipeline.push({
        $lookup: {
          from: 'answers',
          localField: 'interactions.answer',
          foreignField: '_id',
          as: 'interactions.answer_doc'
        }
      });

      pipeline.push({
        $addFields: {
          'interactions.expertFeedback': { $arrayElemAt: ['$interactions.expertFeedback_doc', 0] },
          'interactions.publicFeedback': { $arrayElemAt: ['$interactions.publicFeedback_doc', 0] },
          'interactions.question': { $arrayElemAt: ['$interactions.question_doc', 0] },
          'interactions.answer': { $arrayElemAt: ['$interactions.answer_doc', 0] }
        }
      });

      // Build AND filters
      const andFilters = [];

      if (department) {
        const parts = department
          .split('-')
          .map(s => s.trim())
          .filter(Boolean)
          .map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
        if (parts.length) {
          andFilters.push({
            'interactions.context.department': {
              $regex: parts.join('|'),
              $options: 'i'
            }
          });
        }
      }

      if (referringUrl) {
        const esc = referringUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        andFilters.push({
          'interactions.referringUrl': { $regex: esc, $options: 'i' }
        });
      }

      if (andFilters.length) pipeline.push({ $match: { $and: andFilters } });

      pipeline.push({
        $group: {
          _id: '$_id',
          doc: { $first: '$$ROOT' },
          interactions: { $push: '$interactions' }
        }
      });

      // Add department/pageLanguage/chatId to root
      pipeline.push({
        $addFields: {
          department: { $arrayElemAt: ['$interactions.context.department', 0] },
          pageLanguage: { $arrayElemAt: ['$interactions.context.pageLanguage', 0] },
          chatId: '$chatId'
        }
      });
      pipeline.push({
        $project: {
          doc: 1,
          interactions: 1,
          department: 1,
          pageLanguage: 1,
          chatId: 1
        }
      });
      pipeline.push({ $replaceRoot: { newRoot: { $mergeObjects: ['$doc', { interactions: '$interactions', department: '$department', pageLanguage: '$pageLanguage', chatId: '$chatId' }] } } });
      pipeline.push({ $sort: { createdAt: -1 } });

      // Get total count for pagination (only if using pagination)
      if (usePagination) {
        const countPipeline = [...pipeline];
        countPipeline.push({ $count: 'total' });
        const countResult = await Chat.aggregate(countPipeline);
        totalCount = countResult.length > 0 ? countResult[0].total : 0;

        // Add pagination to main pipeline
        pipeline.push({ $skip: pageOffset });
        pipeline.push({ $limit: pageLimit });
      }

      chats = await Chat.aggregate(pipeline);
      // Don't populate after aggregation since we already have the data
    } else {
      // Get total count for pagination (only if using pagination)
      if (usePagination) {
        totalCount = await Chat.countDocuments(dateFilter);
      }

      let query = Chat.find(dateFilter)
        .populate(populateConfig)
        .sort({ createdAt: -1 });

      // Add pagination only if requested
      if (usePagination) {
        query = query.skip(pageOffset).limit(pageLimit);
      }

      chats = await query;
    }

    const response = { 
      success: true, 
      logs: chats
    };

    // Only include pagination info if pagination was used
    if (usePagination) {
      response.pagination = {
        total: totalCount,
        limit: pageLimit,
        offset: pageOffset,
        hasMore: pageOffset + pageLimit < totalCount
      };
    }

    return res.status(200).json(response);

  } catch (error) {
    console.error(error);
    return res.status(500).json({
      error: 'Failed to fetch logs',
      details: error.message
    });
  }
}

export default function handler(req, res) {
  return withProtection(
    chatLogsHandler,
    authMiddleware,
    adminMiddleware
  )(req, res);
}
