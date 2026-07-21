import dbConnect from '../db/db-connect.js';
import { Chat } from '../../models/chat.js';
import { withProtection } from '../../middleware/auth.js';
import { getPartnerEvalAggregationExpression, getAiEvalAggregationExpression } from '../util/chat-filters.js';
import { NON_NORMAL_ANSWER_TYPES } from '../util/answerTypes.js';
import { getAllProgramNameMap } from '../data/programSeedsLoader.js';
import { parseRequestFilters, executeWithRetry } from './metrics-common.js';

const MAX_PROGRAMS = 25;

// Question volume grouped by the per-question program classification
// (context.program — see docs/plans/program-action-classification.md).
// Mirrors buildDepartmentPipeline in metrics-departments.js, including the
// cross-filter support, but only counts volume. Restricted to normal answers:
// non-normal answer types (not-gc / pt-muni / clarifying-question) carry no
// program and are never classified, so counting them would only inflate the
// 'unknown' bucket. Unclassified ('' — historical or failed call) and
// low-confidence ('unknown') normal questions are folded into a single
// 'unknown' sentinel bucket the client translates for display.
function buildProgramPipeline(dateFilter, extraFilters = [], departmentFilter = [], answerTypeFilter = null, partnerEvalFilter = null, aiEvalFilter = null) {
    const stages = [
        { $match: dateFilter },
        {
            $lookup: {
                from: 'interactions',
                localField: 'interactions',
                foreignField: '_id',
                as: 'interactions'
            }
        },
        { $unwind: '$interactions' },
        ...(extraFilters.length > 0 ? [{ $match: { $and: extraFilters } }] : []),
        {
            $lookup: {
                from: 'contexts',
                localField: 'interactions.context',
                foreignField: '_id',
                as: 'ctx'
            }
        },
        {
            $addFields: {
                department: { $ifNull: [{ $arrayElemAt: ['$ctx.department', 0] }, 'Unknown'] },
                program: {
                    $let: {
                        vars: { raw: { $ifNull: [{ $arrayElemAt: ['$ctx.program', 0] }, ''] } },
                        in: { $cond: [{ $in: ['$$raw', ['', 'unknown']] }, 'unknown', '$$raw'] }
                    }
                }
            }
        },
        // Apply department filter after context lookup
        ...(departmentFilter.length > 0 ? [{ $match: { $and: departmentFilter } }] : []),
        // Resolve the answer type (empty defaults to normal, matching the other
        // metrics pipelines) and drop non-normal answers — they carry no program.
        {
            $lookup: {
                from: 'answers',
                localField: 'interactions.answer',
                foreignField: '_id',
                as: 'ansDoc'
            }
        },
        {
            $addFields: {
                answerType: { $ifNull: [{ $arrayElemAt: ['$ansDoc.answerType', 0] }, 'normal'] }
            }
        },
        { $match: { answerType: { $nin: NON_NORMAL_ANSWER_TYPES } } },
        // Project only fields needed for aggregation + cross-filter lookups.
        // pageLanguage stays on the base chat document (interactions were
        // unwound from it) and is kept so the group stage can split EN/FR.
        {
            $project: {
                program: 1,
                answerType: 1,
                pageLanguage: 1,
                autoEvalId: '$interactions.autoEval',
                expertFeedbackId: '$interactions.expertFeedback'
            }
        }
    ];

    // 1. Answer Type Filter (user-selected cross-filter). answerType is already
    // resolved above, so this is a plain match — no second answers lookup.
    if (answerTypeFilter) {
        stages.push({ $match: answerTypeFilter });
    }

    // 2. Partner Eval Filter
    if (partnerEvalFilter) {
        stages.push(
            {
                $lookup: {
                    from: 'expertfeedbacks',
                    localField: 'expertFeedbackId',
                    foreignField: '_id',
                    as: 'ef_filter'
                }
            },
            {
                $addFields: {
                    category: getPartnerEvalAggregationExpression({ $arrayElemAt: ['$ef_filter', 0] })
                }
            },
            { $match: partnerEvalFilter },
            { $project: { ef_filter: 0, category: 0 } }
        );
    }

    // 3. AI Eval Filter
    if (aiEvalFilter) {
        stages.push(
            {
                $lookup: {
                    from: 'evals',
                    localField: 'autoEvalId',
                    foreignField: '_id',
                    as: 'ae_filter_doc'
                }
            },
            {
                $lookup: {
                    from: 'expertfeedbacks',
                    localField: 'ae_filter_doc.expertFeedback',
                    foreignField: '_id',
                    as: 'ae_ef_filter'
                }
            },
            {
                $addFields: {
                    aiCategory: getAiEvalAggregationExpression({ $arrayElemAt: ['$ae_ef_filter', 0] })
                }
            }
        );

        // Remap filter key
        const remappedFilter = {};
        for (const key in aiEvalFilter) {
            if (key === 'category') remappedFilter['aiCategory'] = aiEvalFilter[key];
            else remappedFilter[key] = aiEvalFilter[key];
        }

        stages.push(
            { $match: remappedFilter },
            { $project: { ae_filter_doc: 0, ae_ef_filter: 0, aiCategory: 0 } }
        );
    }

    stages.push({
        $group: {
            _id: '$program',
            total: { $sum: 1 },
            en: { $sum: { $cond: [{ $eq: ['$pageLanguage', 'en'] }, 1, 0] } },
            fr: { $sum: { $cond: [{ $eq: ['$pageLanguage', 'fr'] }, 1, 0] } }
        }
    });
    stages.push({ $sort: { total: -1 } });
    stages.push({ $limit: MAX_PROGRAMS });
    return stages;
}

async function getProgramMetrics(req, res) {
    if (req.method !== 'GET') return res.status(405).json({ message: 'Method not allowed' });
    try {
        await dbConnect();
        const { dateFilter, extraFilterConditions, departmentFilter, answerTypeFilter, partnerEvalFilter, aiEvalFilter } = parseRequestFilters(req);
        if (!dateFilter.createdAt) return res.status(400).json({ error: 'Invalid date range' });

        const result = await executeWithRetry(() => Chat.aggregate(buildProgramPipeline(dateFilter, extraFilterConditions, departmentFilter, answerTypeFilter, partnerEvalFilter, aiEvalFilter)).allowDiskUse(true));

        // Stored program names are canonical English; attach the curated French
        // name (when one exists) so the client can localize the chart without a
        // second round trip. Emergent/unmapped names keep an empty programFr and
        // fall back to English at display time.
        const frMap = getAllProgramNameMap();
        const topPrograms = result.map((row) => ({
            program: row._id,
            count: row.total,
            en: row.en || 0,
            fr: row.fr || 0,
            programFr: frMap.get(row._id) || ''
        }));

        return res.status(200).json({ success: true, metrics: { topPrograms } });
    } catch (error) {
        console.error('Error in program metrics:', error);
        return res.status(500).json({ error: 'Failed to fetch program metrics' });
    }
}

export default withProtection(getProgramMetrics);
