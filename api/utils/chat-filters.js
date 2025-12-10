/**
 * Utility functions to categorize expert feedback and AI evals
 */
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function categorizeExpertFeedback(expertFeedback) {
  if (!expertFeedback) return null;

  const hasCitationError = expertFeedback.citationScore === 0;

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

export function filterByPartnerEval(chats, category) {
  if (!category || category === 'all') return chats;
  return chats.filter(chat => {
    return chat.interactions && chat.interactions.some(interaction => {
      const c = categorizeExpertFeedback(interaction.expertFeedback);
      return c === category;
    });
  });
}

export function getPartnerEvalAggregationExpression() {
  return {
    $cond: {
      if: { $eq: [{ $arrayElemAt: ['$expertFeedbackDocs', 0] }, null] },
      then: 'none',
      else: {
        $let: {
          vars: {
            ef: { $arrayElemAt: ['$expertFeedbackDocs', 0] },
            hasCitationError: { $eq: ['$ef.citationScore', 0] },
            hasHarmful: { $or: [
              { $eq: ['$ef.sentence1Harmful', true] },
              { $eq: ['$ef.sentence2Harmful', true] },
              { $eq: ['$ef.sentence3Harmful', true] },
              { $eq: ['$ef.sentence4Harmful', true] }
            ] },
            hasError: { $or: [
              { $eq: ['$ef.sentence1Score', 0] },
              { $eq: ['$ef.sentence2Score', 0] },
              { $eq: ['$ef.sentence3Score', 0] },
              { $eq: ['$ef.sentence4Score', 0] }
            ] },
            hasNeedsImprovement: { $or: [
              { $eq: ['$ef.sentence1Score', 80] },
              { $eq: ['$ef.sentence2Score', 80] },
              { $eq: ['$ef.sentence3Score', 80] },
              { $eq: ['$ef.sentence4Score', 80] },
              { $eq: ['$ef.citationScore', 20] }
            ] }
          },
          in: {
            $switch: {
              branches: [
                { case: '$$hasHarmful', then: 'harmful' },
                { case: '$$hasCitationError', then: 'hasCitationError' },
                { case: '$$hasError', then: 'hasError' },
                { case: '$$hasNeedsImprovement', then: 'needsImprovement' }
              ],
              default: 'correct'
            }
          }
        }
      }
    }
  };
}

export function getChatFilterConditions(filters) {
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
    conditions.push({ 'interactions.context.department': { $regex: escaped, $options: 'i' } });
  }

  // referringUrl
  if (filters.referringUrl) {
    const escaped = escapeRegex(filters.referringUrl);
    conditions.push({ 'interactions.referringUrl': { $regex: escaped, $options: 'i' } });
  }

  // urlEn and urlFr
  if (filters.urlEn || filters.urlFr) {
    const urlOr = [];
    if (filters.urlEn) {
      const escaped = escapeRegex(filters.urlEn);
      urlOr.push({ 'interactions.referringUrl': { $regex: escaped, $options: 'i' } });
    }
    if (filters.urlFr) {
      const escaped = escapeRegex(filters.urlFr);
      urlOr.push({ 'interactions.referringUrl': { $regex: escaped, $options: 'i' } });
    }
    if (urlOr.length) conditions.push({ $or: urlOr });
  }

  // answerType
  if (filters.answerType && filters.answerType !== 'all') {
    conditions.push({ 'interactions.answer.answerType': filters.answerType });
  }

  // partnerEval
  if (filters.partnerEval && filters.partnerEval !== 'all') {
    conditions.push({ 'interactions.partnerEval': filters.partnerEval });
  }

  // aiEval
  if (filters.aiEval && filters.aiEval !== 'all') {
    conditions.push({ 'interactions.aiEval': filters.aiEval });
  }

  return conditions;
}
