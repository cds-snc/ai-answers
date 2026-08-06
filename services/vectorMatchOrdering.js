function feedbackTimestamp(value) {
  const timestamp = value ? new Date(value).getTime() : NaN;
  return Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY;
}

// Similarity remains the primary ranking signal. When candidates are equally
// similar, prefer the most recently expert-reviewed answer.
export function compareVectorMatches(a, b) {
  const similarityDifference = b.similarity - a.similarity;
  if (similarityDifference !== 0) return similarityDifference;
  return feedbackTimestamp(b.expertFeedbackCreatedAt) - feedbackTimestamp(a.expertFeedbackCreatedAt);
}
