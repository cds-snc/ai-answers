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

export function filterByPartnerEval(chats, category) {
  if (!category || category === 'all') return chats;
  return chats.reduce((acc, chat) => {
    const matched = filterInteractionsByCategory(chat, category, (interaction) => categorizeExpertFeedback(interaction.expertFeedback));
    if (matched) acc.push(matched);
    return acc;
  }, []);
}

export function filterByAiEval(chats, category) {
  if (!category || category === 'all') return chats;
  return chats.reduce((acc, chat) => {
    const matched = filterInteractionsByCategory(chat, category, (interaction) => categorizeAiEval(interaction.autoEval));
    if (matched) acc.push(matched);
    return acc;
  }, []);
}

export function getPartnerEvalAggregationExpression() {
  return {
    $cond: {
      if: { $eq: [{ $ifNull: ['$interactions.expertFeedback', null] }, null] },
      // Amazon DocumentDB does not support $$REMOVE; return null instead
      then: null,
      else: {
        $let: {
          vars: {
            ef: { $ifNull: ['$interactions.expertFeedback', null] }
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
                    { $eq: ['$$ef.sentence4Score', 0] }
                  ]
                },
                hasNeedsImprovement: {
                  $or: [
                    { $eq: ['$$ef.sentence1Score', 80] },
                    { $eq: ['$$ef.sentence2Score', 80] },
                    { $eq: ['$$ef.sentence3Score', 80] },
                    { $eq: ['$$ef.sentence4Score', 80] },
                    { $eq: ['$$ef.citationScore', 20] }
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
                      default: 'correct'
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

export function getAiEvalAggregationExpression() {
  return {
    $let: {
      vars: {
        autoEval: { $ifNull: ['$interactions.autoEval', null] },
        ef: { $ifNull: ['$interactions.autoEval.expertFeedback', null] }
      },
      in: {
        $cond: {
          if: {
            $or: [
              { $eq: ['$$autoEval', null] },
              { $eq: ['$$ef', null] }
            ]
          },
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
                    { $eq: ['$$ef.sentence4Score', 0] }
                  ]
                },
                hasNeedsImprovement: {
                  $or: [
                    { $eq: ['$$ef.sentence1Score', 80] },
                    { $eq: ['$$ef.sentence2Score', 80] },
                    { $eq: ['$$ef.sentence3Score', 80] },
                    { $eq: ['$$ef.sentence4Score', 80] },
                    { $eq: ['$$ef.citationScore', 20] }
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
                      default: 'correct'
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
  const { basePath = 'interactions' } = options;
  const prefix = basePath ? `${basePath}.` : '';
  const withPath = (field) => `${prefix}${field}`;
  const conditions = [];

  // userType
  if (filters.userType === 'public') {
    conditions.push({ user: { $exists: false } });
  } else if (filters.userType === 'admin') {
    conditions.push({ user: { $exists: true, $ne: null } });
  }

  // department
  if (filters.department) {
    const escaped = escapeRegex(filters.department);
    conditions.push({ [withPath('context.department')]: { $regex: escaped, $options: 'i' } });
  }

  // referringUrl
  if (filters.referringUrl) {
    const escaped = escapeRegex(filters.referringUrl);
    conditions.push({ [withPath('context.referringUrl')]: { $regex: escaped, $options: 'i' } });
  }

  // urlEn and urlFr - combine both values using OR, then rely on $and at the top level
  const urlConditions = [];
  if (filters.urlEn) {
    const escaped = escapeRegex(filters.urlEn);
    urlConditions.push({ [withPath('context.referringUrl')]: { $regex: escaped, $options: 'i' } });
  }
  if (filters.urlFr) {
    const escaped = escapeRegex(filters.urlFr);
    urlConditions.push({ [withPath('context.referringUrl')]: { $regex: escaped, $options: 'i' } });
  }
  if (urlConditions.length === 1) {
    conditions.push(urlConditions[0]);
  } else if (urlConditions.length > 1) {
    conditions.push({ $or: urlConditions });
  }

  // answerType
  if (filters.answerType && filters.answerType !== 'all') {
    conditions.push({ [withPath('answer.answerType')]: filters.answerType });
  }

  // partnerEval
  if (filters.partnerEval && filters.partnerEval !== 'all') {
    conditions.push({ [withPath('partnerEval')]: filters.partnerEval });
  }

  // aiEval
  if (filters.aiEval && filters.aiEval !== 'all') {
    conditions.push({ [withPath('aiEval')]: filters.aiEval });
  }

  return conditions;
}
