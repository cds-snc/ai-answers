// chat-logs-docdb.js

import dbConnect from './db-connect.js';
import { Chat } from '../../models/chat.js';
import { BatchItem } from '../../models/batchItem.js';
import {
  authMiddleware,

  withProtection
} from '../../middleware/auth.js';
import { getChatFilterConditions, getPartnerEvalAggregationExpression, getAiEvalAggregationExpression } from '../utils/chat-filters.js';

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

async function chatLogsHandler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    await dbConnect();
    const {
      startDate, endDate,
      department, referringUrl, urlEn, urlFr, userType, answerType, partnerEval, aiEval,
      timezoneOffsetMinutes,
      limit = 100, lastId, batchId,
    } = req.query;

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

    const partnerEvalValidation = validateCategories(partnerEval, 'partnerEval', validCategories);
    if (partnerEvalValidation !== true) {
      return res.status(400).json({ error: partnerEvalValidation });
    }

    const aiEvalValidation = validateCategories(aiEval, 'aiEval', validCategories);
    if (aiEvalValidation !== true) {
      return res.status(400).json({ error: aiEvalValidation });
    }

    const answerTypeValidation = validateCategories(answerType, 'answerType', validAnswerTypes);
    if (answerTypeValidation !== true) {
      return res.status(400).json({ error: answerTypeValidation });
    }


    let dateFilter = {};
    if (startDate && endDate) {
      const parsedRange = buildDateRange({ startDate, endDate, timezoneOffsetMinutes: Number.isFinite(parseInt(timezoneOffsetMinutes, 10)) ? parseInt(timezoneOffsetMinutes, 10) : undefined });
      if (!parsedRange) {
        return res.status(400).json({ error: 'startDate and endDate are required and must be valid dates (YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss)' });
      }
      dateFilter.createdAt = parsedRange;
    } else {
      const now = new Date();
      const start = new Date(now.getTime() - DEFAULT_DAYS * HOURS_IN_DAY * 60 * 60 * 1000);
      dateFilter.createdAt = { $gte: start, $lte: now };
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
    let totalCount = 0;

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

      // Add computed partnerEval and aiEval fields for filtering
      pipeline.push({
        $addFields: {
          'interactions.partnerEval': getPartnerEvalAggregationExpression(),
          'interactions.aiEval': getAiEvalAggregationExpression()
        }
      });

      // Build AND filters - now includes all conditions including partnerEval and aiEval
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

      if (allConditions.length) pipeline.push({ $match: { $and: allConditions } });

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

      chats = await Chat.aggregate(pipeline);

      totalCount = chats.length;
    } else {
      // Non-aggregate branch - used when no filters are specified
      // Apply batch filter if batchId is provided
      if (batchId) {
        const batchChatItems = await BatchItem.find({ batch: batchId }).select('chat');
        const batchChatIds = batchChatItems.filter(item => item.chat).map(item => item.chat);
        dateFilter = Object.keys(dateFilter).length
          ? { $and: [dateFilter, { _id: { $in: batchChatIds } }] }
          : { _id: { $in: batchChatIds } };
      }

      // Use optimized count pipeline with Promise.all for parallel execution
      const dataPipeline = [
        { $match: dateFilter },
        { $sort: { _id: 1 } },
        { $limit: Number(limit) }
      ];

      const countPipeline = [
        { $match: dateFilter },
        { $count: 'total' }
      ];

      const [chatsResult, countResult] = await Promise.all([
        Chat.aggregate(dataPipeline),
        Chat.aggregate(countPipeline)
      ]);

      // Populate the results
      chats = await Chat.populate(chatsResult, chatPopulate);
      totalCount = countResult[0]?.total || 0;
    }

    const response = {
      success: true,
      logs: chats,
      lastId: chats.length ? chats[chats.length - 1]._id.toString() : null,
      totalCount
    };
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
