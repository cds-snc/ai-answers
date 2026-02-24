/**
 * Utility functions to categorize expert feedback and AI evals
 */
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function categorizeExpertFeedback(expertFeedback) {
  if (!expertFeedback) return null;

  const hasCitationError = expertFeedback.citationScore === 0;
  const totalScore = expertFeedback.totalScore;

  const feedbackFields = [
    { score: expertFeedback.sentence1Score, harmful: expertFeedback.sentence1Harmful },
    { score: expertFeedback.sentence2Score, harmful: expertFeedback.sentence2Harmful },
    { score: expertFeedback.sentence3Score, harmful: expertFeedback.sentence3Harmful },
    { score: expertFeedback.sentence4Score, harmful: expertFeedback.sentence4Harmful }
  ];

  let highestCategory = null;
  let hasAnyScore = false;

  feedbackFields.forEach(({ score, harmful }) => {
    if (score === null || score === undefined) return;
    hasAnyScore = true;
    if (harmful === true) {
      highestCategory = 'harmful';
    } else if (score === 0 && highestCategory !== 'harmful') {
      highestCategory = 'hasError';
    } else if (score === 80 && highestCategory !== 'harmful' && highestCategory !== 'hasError') {
      highestCategory = 'needsImprovement';
    } else if (score === 100 && highestCategory === null) {
      highestCategory = 'correct';
    }
  });

  // Consider totalScore when sentence-level scores are absent
  if (totalScore !== null && totalScore !== undefined) {
    hasAnyScore = true;
    if (totalScore === 0 && highestCategory !== 'harmful') {
      highestCategory = 'hasError';
    } else if (totalScore === 80 && highestCategory !== 'harmful' && highestCategory !== 'hasError') {
      highestCategory = 'needsImprovement';
    } else if (totalScore === 100 && highestCategory === null) {
      highestCategory = 'correct';
    }
  }

  if (expertFeedback.citationScore !== null && expertFeedback.citationScore !== undefined && !hasCitationError) {
    const citationScore = expertFeedback.citationScore;
    if (citationScore === 20 && highestCategory !== 'hasError' && highestCategory !== 'harmful') {
      highestCategory = 'needsImprovement';
    } else if (citationScore === 25 && highestCategory === null) {
      highestCategory = 'correct';
    }
  }

  if (!hasAnyScore && (expertFeedback.citationScore === null || expertFeedback.citationScore === undefined)) {
    return null;
  }

  if (highestCategory === 'harmful') return 'harmful';
  if (hasCitationError) return 'hasCitationError';
  if (highestCategory === 'hasError') return 'hasError';
  if (highestCategory === 'needsImprovement') return 'needsImprovement';
  return 'correct';
}

export function categorizeAiEval(autoEval) {
  if (!autoEval || !autoEval.expertFeedback) return null;
  return categorizeExpertFeedback(autoEval.expertFeedback);
}

const filterInteractionsByCategory = (chat, category, evaluator) => {
  const interactions = chat.interactions || [];
  const filtered = interactions.filter(interaction => evaluator(interaction) === category);
  if (!filtered.length) return null;
  return { ...chat, interactions: filtered };
};

// Note: filterByPartnerEval and filterByAiEval functions were removed.
// Filtering now happens in the aggregation pipeline using computed fields
// via getPartnerEvalAggregationExpression() and getAiEvalAggregationExpression().

export function getPartnerEvalAggregationExpression(feedbackPath = '$interactions.expertFeedback') {
  return {
    $cond: {
      if: { $eq: [{ $ifNull: [feedbackPath, null] }, null] },
      // Amazon DocumentDB does not support $$REMOVE; return null instead
      then: null,
      else: {
        $let: {
          vars: {
            ef: { $ifNull: [feedbackPath, null] }
          },
          in: {
            $let: {
              vars: {
                hasAnyScore: {
                  $or: [
                    { $in: ['$$ef.sentence1Score', [0, 80, 100]] },
                    { $in: ['$$ef.sentence2Score', [0, 80, 100]] },
                    { $in: ['$$ef.sentence3Score', [0, 80, 100]] },
                    { $in: ['$$ef.sentence4Score', [0, 80, 100]] },
                    { $in: ['$$ef.citationScore', [0, 20, 25]] },
                    { $ne: ['$$ef.totalScore', null] }
                  ]
                },
                hasPerfectTotalScore: { $eq: ['$$ef.totalScore', 100] },
                hasCitationError: { $eq: ['$$ef.citationScore', 0] },
                hasHarmful: {
                  $or: [
                    { $eq: ['$$ef.sentence1Harmful', true] },
                    { $eq: ['$$ef.sentence2Harmful', true] },
                    { $eq: ['$$ef.sentence3Harmful', true] },
                    { $eq: ['$$ef.sentence4Harmful', true] }
                  ]
                },
                hasError: {
                  $or: [
                    { $eq: ['$$ef.sentence1Score', 0] },
                    { $eq: ['$$ef.sentence2Score', 0] },
                    { $eq: ['$$ef.sentence3Score', 0] },
                    { $eq: ['$$ef.sentence4Score', 0] },
                    { $eq: ['$$ef.totalScore', 0] }
                  ]
                },
                hasNeedsImprovement: {
                  $or: [
                    { $eq: ['$$ef.sentence1Score', 80] },
                    { $eq: ['$$ef.sentence2Score', 80] },
                    { $eq: ['$$ef.sentence3Score', 80] },
                    { $eq: ['$$ef.sentence4Score', 80] },
                    { $eq: ['$$ef.citationScore', 20] },
                    { $eq: ['$$ef.totalScore', 80] }
                  ]
                }
              },
              in: {
                $cond: {
                  if: '$$hasAnyScore',
                  then: {
                    $switch: {
                      branches: [
                        { case: { $eq: ["$$hasHarmful", true] }, then: 'harmful' },
                        { case: { $eq: ["$$hasCitationError", true] }, then: 'hasCitationError' },
                        { case: { $eq: ["$$hasError", true] }, then: 'hasError' },
                        { case: { $eq: ["$$hasNeedsImprovement", true] }, then: 'needsImprovement' },
                        { case: { $eq: ["$$hasPerfectTotalScore", true] }, then: 'correct' }
                      ],
                      default: null
                    }
                  },
                  // When there is no score data, leave the value as null
                  else: null
                }
              }
            }
          }
        }
      }
    }
  };
}

export function getAiEvalAggregationExpression(feedbackPath = '$interactions.autoEval.expertFeedback') {
  return {
    $let: {
      vars: {
        ef: { $ifNull: [feedbackPath, null] }
      },
      in: {
        $cond: {
          if: { $eq: ['$$ef', null] },
          // DocumentDB does not support $$REMOVE; return null instead
          then: null,
          else: {
            $let: {
              vars: {
                hasAnyScore: {
                  $or: [
                    { $in: ['$$ef.sentence1Score', [0, 80, 100]] },
                    { $in: ['$$ef.sentence2Score', [0, 80, 100]] },
                    { $in: ['$$ef.sentence3Score', [0, 80, 100]] },
                    { $in: ['$$ef.sentence4Score', [0, 80, 100]] },
                    { $in: ['$$ef.citationScore', [0, 20, 25]] },
                    { $ne: ['$$ef.totalScore', null] }
                  ]
                },
                hasPerfectTotalScore: { $eq: ['$$ef.totalScore', 100] },
                hasCitationError: { $eq: ['$$ef.citationScore', 0] },
                hasHarmful: {
                  $or: [
                    { $eq: ['$$ef.sentence1Harmful', true] },
                    { $eq: ['$$ef.sentence2Harmful', true] },
                    { $eq: ['$$ef.sentence3Harmful', true] },
                    { $eq: ['$$ef.sentence4Harmful', true] }
                  ]
                },
                hasError: {
                  $or: [
                    { $eq: ['$$ef.sentence1Score', 0] },
                    { $eq: ['$$ef.sentence2Score', 0] },
                    { $eq: ['$$ef.sentence3Score', 0] },
                    { $eq: ['$$ef.sentence4Score', 0] },
                    { $eq: ['$$ef.totalScore', 0] }
                  ]
                },
                hasNeedsImprovement: {
                  $or: [
                    { $eq: ['$$ef.sentence1Score', 80] },
                    { $eq: ['$$ef.sentence2Score', 80] },
                    { $eq: ['$$ef.sentence3Score', 80] },
                    { $eq: ['$$ef.sentence4Score', 80] },
                    { $eq: ['$$ef.citationScore', 20] },
                    { $eq: ['$$ef.totalScore', 80] }
                  ]
                }
              },
              in: {
                $cond: {
                  if: '$$hasAnyScore',
                  then: {
                    $switch: {
                      branches: [
                        { case: { $eq: ["$$hasHarmful", true] }, then: 'harmful' },
                        { case: { $eq: ["$$hasCitationError", true] }, then: 'hasCitationError' },
                        { case: { $eq: ["$$hasError", true] }, then: 'hasError' },
                        { case: { $eq: ["$$hasNeedsImprovement", true] }, then: 'needsImprovement' },
                        { case: { $eq: ["$$hasPerfectTotalScore", true] }, then: 'correct' }
                      ],
                      default: null
                    }
                  },
                  else: null
                }
              }
            }
          }
        }
      }
    }
  };
}

export function getChatFilterConditions(filters, options = {}) {
  const { basePath = 'interactions', userField = 'user', skipUserCondition = false } = options;
  const prefix = basePath ? `${basePath}.` : '';
  const withPath = (field) => `${prefix}${field}`;
  const conditions = [];

  // userType
  if (!skipUserCondition) {
    if (filters.userType === 'public') {
      conditions.push({ [userField]: { $exists: false } });
    } else if (filters.userType === 'admin') {
      conditions.push({ [userField]: { $exists: true, $ne: null } });
    } else if (filters.userType === 'referredPublic') {
      conditions.push({ [userField]: { $exists: false } });
    }
  }

  if (filters.userType === 'referredPublic') {
    conditions.push({
      [withPath('referringUrl')]: {
        $regex: '(://|\\.)(canada\\.ca|gc\\.ca)(/|$)',
        $options: 'i'
      }
    });
    conditions.push({
      [withPath('referringUrl')]: {
        $not: { $regex: '(://|\\.)(blog|digital|design|alpha|staging|[^./]*test[^./]*)\\.canada\\.ca(/|$)', $options: 'i' }
      }
    });
  }

  // department
  if (filters.department) {
    const escaped = escapeRegex(filters.department);
    conditions.push({ [withPath('department')]: { $regex: escaped, $options: 'i' } });
  }

  // referringUrl
  if (filters.referringUrl) {
    const escaped = escapeRegex(filters.referringUrl);
    conditions.push({ [withPath('referringUrl')]: { $regex: escaped, $options: 'i' } });
  }

  // urlEn and urlFr - combine both values using OR, then rely on $and at the top level
  const urlConditions = [];
  if (filters.urlEn) {
    const escaped = escapeRegex(filters.urlEn);
    urlConditions.push({ [withPath('referringUrl')]: { $regex: escaped, $options: 'i' } });
  }
  if (filters.urlFr) {
    const escaped = escapeRegex(filters.urlFr);
    urlConditions.push({ [withPath('referringUrl')]: { $regex: escaped, $options: 'i' } });
  }
  if (urlConditions.length === 1) {
    conditions.push(urlConditions[0]);
  } else if (urlConditions.length > 1) {
    conditions.push({ $or: urlConditions });
  }

  // answerType - support multi-select via comma-separated values
  if (filters.answerType && filters.answerType !== 'all') {
    const types = filters.answerType.split(',').map(t => t.trim()).filter(Boolean);
    if (types.length === 1) {
      // Single value: exact match (more efficient than $in with one value)
      conditions.push({ [withPath('answerType')]: types[0] });
    } else if (types.length > 1) {
      // Multiple values: use $in operator
      conditions.push({ [withPath('answerType')]: { $in: types } });
    }
  }

  // partnerEval - support multi-select via comma-separated values
  if (filters.partnerEval && filters.partnerEval !== 'all') {
    const categories = filters.partnerEval.split(',').map(c => c.trim()).filter(Boolean);
    const hasNoEval = categories.includes('noEval');
    const evalCategories = categories.filter(c => c !== 'noEval');
    const noEvalCondition = { $or: [{ [withPath('partnerEval')]: null }, { [withPath('partnerEval')]: '' }] };

    if (hasNoEval && evalCategories.length === 0) {
      conditions.push(noEvalCondition);
    } else if (hasNoEval && evalCategories.length > 0) {
      const evalMatch = evalCategories.length === 1
        ? { [withPath('partnerEval')]: evalCategories[0] }
        : { [withPath('partnerEval')]: { $in: evalCategories } };
      conditions.push({ $or: [noEvalCondition, evalMatch] });
    } else if (evalCategories.length === 1) {
      conditions.push({ [withPath('partnerEval')]: evalCategories[0] });
    } else if (evalCategories.length > 1) {
      conditions.push({ [withPath('partnerEval')]: { $in: evalCategories } });
    }
  }

  // aiEval - support multi-select via comma-separated values
  if (filters.aiEval && filters.aiEval !== 'all') {
    const categories = filters.aiEval.split(',').map(c => c.trim()).filter(Boolean);
    const hasNoEval = categories.includes('noEval');
    const evalCategories = categories.filter(c => c !== 'noEval');
    const noEvalCondition = { $or: [{ [withPath('aiEval')]: null }, { [withPath('aiEval')]: '' }] };

    if (hasNoEval && evalCategories.length === 0) {
      conditions.push(noEvalCondition);
    } else if (hasNoEval && evalCategories.length > 0) {
      const evalMatch = evalCategories.length === 1
        ? { [withPath('aiEval')]: evalCategories[0] }
        : { [withPath('aiEval')]: { $in: evalCategories } };
      conditions.push({ $or: [noEvalCondition, evalMatch] });
    } else if (evalCategories.length === 1) {
      conditions.push({ [withPath('aiEval')]: evalCategories[0] });
    } else if (evalCategories.length > 1) {
      conditions.push({ [withPath('aiEval')]: { $in: evalCategories } });
    }
  }

  return conditions;
}
