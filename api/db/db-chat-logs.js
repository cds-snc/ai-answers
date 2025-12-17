// chat-logs-docdb.js

import dbConnect from './db-connect.js';
import { Chat } from '../../models/chat.js';
import { BatchItem } from '../../models/batchItem.js';
import {
  authMiddleware,

  withProtection
} from '../../middleware/auth.js';
import { filterByPartnerEval, filterByAiEval, getChatFilterConditions } from '../utils/chat-filters.js';

async function chatLogsHandler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    await dbConnect();
    const {
      startDate, endDate,
      department, referringUrl, urlEn, urlFr, userType, answerType, partnerEval, aiEval,
       limit = 100, lastId, batchId,
    } = req.query;

    // Validate eval category inputs
    const validCategories = ['all', 'correct', 'needsImprovement', 'hasError', 'hasCitationError', 'harmful'];
    if (partnerEval && !validCategories.includes(partnerEval)) {
      return res.status(400).json({ error: 'Invalid partnerEval value' });
    }
    if (aiEval && !validCategories.includes(aiEval)) {
      return res.status(400).json({ error: 'Invalid aiEval value' });
    }


  let dateFilter = {};
    if (startDate && endDate) {
      dateFilter.createdAt = { $gte: new Date(startDate), $lte: new Date(endDate) };
    }

    if (lastId && lastId !== 'null' && lastId !== null) {
      dateFilter._id = { $gt: lastId };
    }

    // Add userType filter
    if (userType === 'public') {
      dateFilter.user = { $exists: false };
    } else if (userType === 'admin') {
      dateFilter.user = { $exists: true };
    }
    // If userType is 'all' or undefined, no filter is applied
   
    const totalCount = await Chat.countDocuments(dateFilter);

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

    let chats;

    // If department or referringUrl/urlEn/urlFr/answerType/partnerEval/aiEval filters are used, we use an aggregation pipeline
    if (department || referringUrl || urlEn || urlFr || answerType || partnerEval || aiEval) {
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

      // Populate user like the non-aggregate branch so email is available
      pipeline.push({
        $lookup: {
          from: 'users',
          localField: 'user',
          foreignField: '_id',
          as: 'user'
        }
      });

      pipeline.push({
        $addFields: {
          user: { $arrayElemAt: ['$user', 0] }
        }
      });

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

      // Lookup full answer documents
      pipeline.push({
        $lookup: {
          from: 'answers',
          localField: 'interactions.answer',
          foreignField: '_id',
          as: 'interactions.answer'
        }
      });
      pipeline.push({
        $addFields: {
          'interactions.answer': { $arrayElemAt: ['$interactions.answer', 0] }
        }
      });
      pipeline.push({
        $lookup: {
          from: 'citations',
          localField: 'interactions.answer.citation',
          foreignField: '_id',
          as: 'interactions.answer.citation'
        }
      });
      pipeline.push({
        $addFields: {
          'interactions.answer.citation': { $arrayElemAt: ['$interactions.answer.citation', 0] }
        }
      });

      pipeline.push({
        $addFields: {
          'interactions.expertFeedback': { $arrayElemAt: ['$interactions.expertFeedback_doc', 0] },
          'interactions.publicFeedback': { $arrayElemAt: ['$interactions.publicFeedback_doc', 0] },
          'interactions.question': { $arrayElemAt: ['$interactions.question_doc', 0] }
        }
      });
      // Add autoEval lookup and nested expertFeedback
      pipeline.push({
        $lookup: {
          from: 'evals',
          localField: 'interactions.autoEval',
          foreignField: '_id',
          as: 'interactions.autoEval'
        }
      });
      pipeline.push({
        $unwind: {
          path: '$interactions.autoEval',
          preserveNullAndEmptyArrays: true
        }
      });
      pipeline.push({
        $lookup: {
          from: 'expertfeedbacks',
          localField: 'interactions.autoEval.expertFeedback',
          foreignField: '_id',
          as: 'interactions.autoEval.expertFeedback'
        }
      });
      pipeline.push({
        $addFields: {
          'interactions.autoEval.expertFeedback': { $arrayElemAt: ['$interactions.autoEval.expertFeedback', 0] }
        }
      });

      // Build AND filters
      const allConditions = getChatFilterConditions({
        department,
        referringUrl,
        urlEn,
        urlFr,
        userType,
        answerType,
        partnerEval,
        aiEval
      });
      const andFilters = allConditions.filter(cond => {
        // Exclude partnerEval and aiEval conditions since they are filtered post-query
        return !cond.hasOwnProperty('interactions.partnerEval') && !cond.hasOwnProperty('interactions.aiEval');
      });

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

      // Use $facet to get count and results in one query
      pipeline.push({
        $facet: {
          metadata: [{ $count: 'totalCount' }],
          data: [
            { $sort: { createdAt: -1 } },
            { $limit: Number(limit) }
          ]
        }
      });

      const [facetResult] = await Chat.aggregate(pipeline).allowDiskUse(true);
      const aggregateTotalCount = facetResult?.metadata[0]?.totalCount || 0;
      chats = facetResult?.data || [];

      // Apply post-query eval filters if requested
      if (partnerEval && partnerEval !== 'all') {
        chats = filterByPartnerEval(chats, partnerEval);
      }
      if (aiEval && aiEval !== 'all') {
        chats = filterByAiEval(chats, aiEval);
      }

      const response = {
        success: true,
        logs: chats,
        lastId: chats.length ? chats[chats.length - 1]._id.toString() : null,
        totalCount: aggregateTotalCount
      };
      return res.status(200).json(response);
    } else {
      // Non-aggregate branch
      // Apply batch filter if batchId is provided
      if (batchId) {
        const batchChatItems = await BatchItem.find({ batch: batchId }).select('chat');
        const batchChatIds = batchChatItems.filter(item => item.chat).map(item => item.chat);
        dateFilter = Object.keys(dateFilter).length
          ? { $and: [ dateFilter, { _id: { $in: batchChatIds } } ] }
          : { _id: { $in: batchChatIds } };
      }

      let query = Chat.find(dateFilter)
        .populate(chatPopulate)
        .sort({ _id: 1 }) // Ensure consistent ordering for pagination
        .limit(Number(limit));
      chats = await query;

      // Apply post-query eval filters in non-aggregate branch as well
      if (partnerEval && partnerEval !== 'all') {
        chats = filterByPartnerEval(chats, partnerEval);
      }
      if (aiEval && aiEval !== 'all') {
        chats = filterByAiEval(chats, aiEval);
      }

      const response = {
        success: true,
        logs: chats,
        lastId: chats.length ? chats[chats.length - 1]._id.toString() : null,
        totalCount
      };
    }

    return res.status(200).json(response);
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
    authMiddleware
  )(req, res);
}
