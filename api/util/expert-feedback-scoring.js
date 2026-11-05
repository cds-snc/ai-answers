import { Answer } from '../../models/answer.js';

// The rating options the expert form offers (ExpertFeedbackComponent.js).
const SENTENCE_SCORES = [100, 80, 0];
const CITATION_SCORES = [25, 20, 0];
const SENTENCE_SCORE_FIELDS = ['sentence1Score', 'sentence2Score', 'sentence3Score', 'sentence4Score'];

export const SCORE_FIELDS = [...SENTENCE_SCORE_FIELDS, 'citationScore'];
export const TEXT_FIELDS = [
  'sentence1Explanation', 'sentence2Explanation', 'sentence3Explanation', 'sentence4Explanation',
  'citationExplanation', 'expertCitationUrl',
];
export const FLAG_FIELDS = [
  'sentence1Harmful', 'sentence2Harmful', 'sentence3Harmful', 'sentence4Harmful',
  'sentence1ContentIssue', 'sentence2ContentIssue', 'sentence3ContentIssue', 'sentence4ContentIssue',
];

// The first score that isn't a form option or blank (null), or null if none.
// Thumbs up sends no scores at all, hence allowMissing for creating a review.
export function findInvalidScore(form, { allowMissing = false } = {}) {
  return SCORE_FIELDS.find((field) => {
    const value = form[field];
    if (value === undefined && allowMissing) return false;
    const allowed = field === 'citationScore' ? CITATION_SCORES : SENTENCE_SCORES;
    return value !== null && !allowed.includes(value);
  }) || null;
}

// Same sum as the form's computeTotalScore. The server's result is the one
// saved: a total sent in a request is never trusted, because it decides which
// answers get reused. Unrated counts as good, so no ratings at all is 100.
export function computeTotalScore(form, sentenceCount) {
  const scores = SENTENCE_SCORE_FIELDS.slice(0, sentenceCount).map((field) => form[field] ?? 100);
  const sentenceAverage = scores.reduce((sum, score) => sum + score, 0) / scores.length;
  return Math.round((sentenceAverage * 0.75 + (form.citationScore ?? 25)) * 100) / 100;
}

// Same rule as evaluation.worker.js, so the label can't contradict the score.
export function feedbackLabel(totalScore) {
  return totalScore === 100 ? 'positive' : 'negative';
}

// How many sentences an answer was rated on, 1 to 4.
export async function getAnswerSentenceCount(answerId) {
  const answer = answerId ? await Answer.findById(answerId, { sentences: 1, content: 1 }).lean() : null;
  const stored = answer?.sentences?.length || 0;
  const tagged = String(answer?.content || '').match(/<s-?\d+>/g)?.length || 0;
  return Math.min(4, Math.max(1, stored || tagged));
}
