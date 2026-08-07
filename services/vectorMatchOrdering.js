function feedbackTimestamp(value) {
  const timestamp = value ? new Date(value).getTime() : NaN;
  // Treat missing or invalid review dates as older than any valid timestamp.
  return Number.isFinite(timestamp) ? timestamp : -Infinity;
}

// Similarity remains the primary ranking signal. When candidates are equally
// similar, prefer the most recently expert-reviewed answer.
export function compareVectorMatches(a, b) {
  const aSimilarity = Number.isFinite(a?.similarity) ? a.similarity : -Infinity;
  const bSimilarity = Number.isFinite(b?.similarity) ? b.similarity : -Infinity;
  if (bSimilarity !== aSimilarity) return aSimilarity > bSimilarity ? -1 : 1;

  const aTimestamp = feedbackTimestamp(a?.expertFeedbackCreatedAt);
  const bTimestamp = feedbackTimestamp(b?.expertFeedbackCreatedAt);
  if (bTimestamp === aTimestamp) return 0;
  return aTimestamp > bTimestamp ? -1 : 1;
}
