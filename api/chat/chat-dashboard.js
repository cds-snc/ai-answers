import dbConnect from '../db/db-connect.js';
import { Chat } from '../../models/chat.js';
import mongoose from 'mongoose';
import { authMiddleware, partnerOrAdminMiddleware, withProtection } from '../../middleware/auth.js';
import { getPartnerEvalAggregationExpression, getAiEvalAggregationExpression, getChatFilterConditions } from '../util/chat-filters.js';

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
        // For descending sort, get documents with _id < lastId
        initialMatch._id = { $lt: lastId };
      } catch (err) {
        return res.status(400).json({ error: 'Invalid lastId' });
      }
    }

    if (Object.keys(initialMatch).length) {
      pipeline.push({ $match: initialMatch });
    }

    // Trim early to only the fields we need downstream
    pipeline.push({
      $project: {
        chatId: 1,
        user: 1,
        interactions: 1,
        createdAt: 1,
        pageLanguage: 1
      }
    });

    // DocumentDB-safe lookups (single-field joins) with immediate projections to minimize memory

    // Lookup interactions - only need referringUrl, answer, context, expertFeedback, autoEval refs
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

    // Project interaction to only needed fields immediately
    pipeline.push({
      $addFields: {
        'interactions': {
          _id: '$interactions._id',
          question: '$interactions.question',
          referringUrl: '$interactions.referringUrl',
          answer: '$interactions.answer',
          context: '$interactions.context',
          expertFeedback: '$interactions.expertFeedback',
          autoEval: '$interactions.autoEval'
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

    // Lookup answers - only need answerType
    pipeline.push({
      $lookup: {
        from: 'answers',
        localField: 'interactions.answer',
        foreignField: '_id',
        as: 'interactionAnswer'
      }
    });
    // Extract only answerType immediately
    pipeline.push({
      $addFields: {
        'interactions.answerType': { $ifNull: [{ $arrayElemAt: ['$interactionAnswer.answerType', 0] }, ''] }
      }
    });

    // Lookup contexts - only need department
    pipeline.push({
      $lookup: {
        from: 'contexts',
        localField: 'interactions.context',
        foreignField: '_id',
        as: 'interactionContext'
      }
    });
    // Extract only department immediately
    pipeline.push({
      $addFields: {
        'interactions.department': { $ifNull: [{ $arrayElemAt: ['$interactionContext.department', 0] }, ''] }
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
    // Extract only needed fields immediately
    pipeline.push({
      $addFields: {
        'interactions.expertEmail': { $ifNull: [{ $arrayElemAt: ['$expertFeedbackDocs.expertEmail', 0] }, ''] },
        'interactions.expertFeedbackData': {
          totalScore: { $arrayElemAt: ['$expertFeedbackDocs.totalScore', 0] },
          sentence1Score: { $arrayElemAt: ['$expertFeedbackDocs.sentence1Score', 0] },
          sentence2Score: { $arrayElemAt: ['$expertFeedbackDocs.sentence2Score', 0] },
          sentence3Score: { $arrayElemAt: ['$expertFeedbackDocs.sentence3Score', 0] },
          sentence4Score: { $arrayElemAt: ['$expertFeedbackDocs.sentence4Score', 0] },
          citationScore: { $arrayElemAt: ['$expertFeedbackDocs.citationScore', 0] },
          sentence1Harmful: { $arrayElemAt: ['$expertFeedbackDocs.sentence1Harmful', 0] },
          sentence2Harmful: { $arrayElemAt: ['$expertFeedbackDocs.sentence2Harmful', 0] },
          sentence3Harmful: { $arrayElemAt: ['$expertFeedbackDocs.sentence3Harmful', 0] },
          sentence4Harmful: { $arrayElemAt: ['$expertFeedbackDocs.sentence4Harmful', 0] }
        }
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
    // Extract only expertFeedback ref
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
    // Extract only needed fields for aiEval computation
    pipeline.push({
      $addFields: {
        'interactions.autoEvalFeedbackData': {
          totalScore: { $arrayElemAt: ['$autoEvalExpertFeedbackDocs.totalScore', 0] },
          sentence1Score: { $arrayElemAt: ['$autoEvalExpertFeedbackDocs.sentence1Score', 0] },
          sentence2Score: { $arrayElemAt: ['$autoEvalExpertFeedbackDocs.sentence2Score', 0] },
          sentence3Score: { $arrayElemAt: ['$autoEvalExpertFeedbackDocs.sentence3Score', 0] },
          sentence4Score: { $arrayElemAt: ['$autoEvalExpertFeedbackDocs.sentence4Score', 0] },
          citationScore: { $arrayElemAt: ['$autoEvalExpertFeedbackDocs.citationScore', 0] },
          sentence1Harmful: { $arrayElemAt: ['$autoEvalExpertFeedbackDocs.sentence1Harmful', 0] },
          sentence2Harmful: { $arrayElemAt: ['$autoEvalExpertFeedbackDocs.sentence2Harmful', 0] },
          sentence3Harmful: { $arrayElemAt: ['$autoEvalExpertFeedbackDocs.sentence3Harmful', 0] },
          sentence4Harmful: { $arrayElemAt: ['$autoEvalExpertFeedbackDocs.sentence4Harmful', 0] }
        }
      }
    });

    // Clean up temporary lookup arrays to free memory before $group
    pipeline.push({
      $project: {
        interactionAnswer: 0,
        interactionContext: 0,
        interactionQuestion: 0,
        expertFeedbackDocs: 0,
        interactionEval: 0,
        autoEvalExpertFeedbackDocs: 0
      }
    });

    // Compute partnerEval and aiEval using the extracted minimal data
    pipeline.push({
      $addFields: {
        'interactions.partnerEval': getPartnerEvalAggregationExpression('$interactions.expertFeedbackData'),
        'interactions.aiEval': getAiEvalAggregationExpression('$interactions.autoEvalFeedbackData')
      }
    });

    pipeline.push({
      $project: {
        // Inclusion-only projection to avoid invalid mixed include/exclude
        chatId: 1,
        user: 1,
        createdAt: 1,
        pageLanguage: 1,
        interactions: {
          department: '$interactions.department',
          expertEmail: '$interactions.expertEmail',
          referringUrl: '$interactions.referringUrl',
          redactedQuestion: '$interactions.redactedQuestion',
          answerType: '$interactions.answerType',
          partnerEval: '$interactions.partnerEval',
          aiEval: '$interactions.aiEval'
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

    pipeline.push({ $project: { creator: 0 } });

    const filters = { userType, department, referringUrl, urlEn, urlFr, answerType, partnerEval, aiEval };
    const andFilters = getChatFilterConditions(filters);

    if (andFilters.length) {
      pipeline.push({ $match: { $and: andFilters } });
    }

    // Handle search parameter for chatId (after grouping, so applied separately)
    const searchFilter = searchParam ? { chatId: { $regex: escapeRegex(searchParam), $options: 'i' } } : null;

    // Sort by chat _id and interaction _id so $first in $group reliably picks the earliest interaction
    pipeline.push({ $sort: { _id: 1, 'interactions._id': 1 } });

    pipeline.push({
      $group: {
        _id: '$_id',
        chatId: { $first: '$chatId' },
        createdAt: { $first: '$createdAt' },
        creatorEmail: { $first: '$creatorEmail' },
        pageLanguage: { $first: '$pageLanguage' },
        interactionCount: { $sum: 1 },
        redactedQuestion: { $first: '$interactions.redactedQuestion' },
        departments: {
          $addToSet: '$interactions.department'
        },
        expertEmails: {
          $addToSet: '$interactions.expertEmail'
        },
        referringUrls: {
          $addToSet: '$interactions.referringUrl'
        },
        answerTypes: {
          $addToSet: '$interactions.answerType'
        },
        partnerEvals: {
          $addToSet: '$interactions.partnerEval'
        },
        aiEvals: {
          $addToSet: '$interactions.aiEval'
        }
      }
    });

    pipeline.push({
      $project: {
        // keep _id so we can use it as a cursor for pagination
        chatId: 1,
        createdAt: 1,
        creatorEmail: 1,
        interactionCount: 1,
        redactedQuestion: 1,
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
                // If department filter is set and exists in filtered array, use it as primary
                {
                  $cond: [
                    {
                      $and: [
                        { $ne: [department, ''] },
                        { $gte: [{ $indexOfArray: ['$$filtered', department] }, 0] }
                      ]
                    },
                    department,
                    { $arrayElemAt: ['$$filtered', 0] }
                  ]
                },
                ''
              ]
            }
          }
        },
        allDepartments: {
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
        },
        referringUrl: { $arrayElemAt: ['$referringUrls', 0] },
        answerType: {
          $switch: {
            branches: [
              { case: { $in: ['not-gc', '$answerTypes'] }, then: 'not-gc' },
              { case: { $in: ['pt-muni', '$answerTypes'] }, then: 'pt-muni' },
              { case: { $in: ['clarifying-question', '$answerTypes'] }, then: 'clarifying-question' },
              { case: { $in: ['normal', '$answerTypes'] }, then: 'normal' }
            ],
            default: null
          }
        },
        partnerEval: {
          $switch: {
            branches: [
              { case: { $in: ['harmful', '$partnerEvals'] }, then: 'harmful' },
              { case: { $in: ['hasCitationError', '$partnerEvals'] }, then: 'hasCitationError' },
              { case: { $in: ['hasError', '$partnerEvals'] }, then: 'hasError' },
              { case: { $in: ['needsImprovement', '$partnerEvals'] }, then: 'needsImprovement' },
              { case: { $in: ['correct', '$partnerEvals'] }, then: 'correct' }
            ],
            default: null
          }
        },
        aiEval: {
          $switch: {
            branches: [
              { case: { $in: ['harmful', '$aiEvals'] }, then: 'harmful' },
              { case: { $in: ['hasCitationError', '$aiEvals'] }, then: 'hasCitationError' },
              { case: { $in: ['hasError', '$aiEvals'] }, then: 'hasError' },
              { case: { $in: ['needsImprovement', '$aiEvals'] }, then: 'needsImprovement' },
              { case: { $in: ['correct', '$aiEvals'] }, then: 'correct' }
            ],
            default: null
          }
        },
        userType: {
          $cond: {
            if: { $and: [{ $ne: ['$creatorEmail', ''] }, { $ne: ['$creatorEmail', null] }] },
            then: 'admin',
            else: 'public'
          }
        },
        pageLanguage: 1
      }
    });


    // Apply search filter if present (after $project stage)
    if (searchFilter) {
      pipeline.push({ $match: searchFilter });
    }

    // Keep a copy of pipeline before adding sort/limit to calculate totalCount
    const pipelineBeforeSortLimit = pipeline.slice();

    // Dynamic sort mapping - all columns that can be sorted on
    const sortFieldMap = {
      createdAt: 'createdAt',
      chatId: 'chatId',
      department: 'department',
      expertEmail: 'expertEmail',
      creatorEmail: 'creatorEmail',
      pageLanguage: 'pageLanguage',
      referringUrl: 'referringUrl',
      userType: 'userType',
      answerType: 'answerType',
      partnerEval: 'partnerEval',
      aiEval: 'aiEval',
      interactionCount: 'interactionCount'
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

    // Build count pipeline before modifying main pipeline with sort/limit
    const countPipeline = pipelineBeforeSortLimit.slice();
    countPipeline.push({ $group: { _id: '$_id' } });
    countPipeline.push({ $count: 'totalCount' });

    // Run data and count queries in parallel for better performance
    const [results, countResult] = await Promise.all([
      Chat.aggregate(pipeline).allowDiskUse(true),
      Chat.aggregate(countPipeline).allowDiskUse(true)
    ]);

    const totalCount = (countResult && countResult[0] && countResult[0].totalCount) || 0;

    const chats = results.map((chat) => ({
      _id: chat._id ? String(chat._id) : '',
      chatId: chat.chatId || '',
      department: chat.department || '',
      allDepartments: Array.isArray(chat.allDepartments) ? chat.allDepartments : [],
      expertEmail: chat.expertEmail || '',
      creatorEmail: chat.creatorEmail || '',
      date: chat.createdAt ? chat.createdAt.toISOString() : null,
      pageLanguage: chat.pageLanguage || '',
      referringUrl: chat.referringUrl || '',
      answerType: chat.answerType || '',
      partnerEval: chat.partnerEval || '',
      aiEval: chat.aiEval || '',
      userType: chat.userType || 'public',
      interactionCount: chat.interactionCount || 0,
      redactedQuestion: chat.redactedQuestion || ''
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
