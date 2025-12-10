/**
 * Utility functions to categorize expert feedback and AI evals
 */
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

export function filterByAiEval(chats, category) {
  if (!category || category === 'all') return chats;
  return chats.filter(chat => {
    return chat.interactions && chat.interactions.some(interaction => {
      const c = categorizeAiEval(interaction.autoEval);
      return c === category;
    });
  });
}
