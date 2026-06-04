/**
 * User feedback options and score mappings
 * This is the single source of truth for public feedback scores and their corresponding keys
 */

export const FEEDBACK_OPTIONS = {
  YES: [
    { id: 'noCall', score: 1 },
    { id: 'noVisit', score: 2 },
    { id: 'savedTime', score: 3 },
    { id: 'other', score: 4 },
  ],
  NO: [
    // notWanted ("answer is clear, but not what I wanted to hear") is a 'no'
    // click, but it is positive feedback about AI Answers: the answer was
    // clear/correct — the user simply disliked the real-world outcome. So we
    // classify it as positive about AI regardless of the user's yes/no click.
    { id: 'notWanted', score: 5, positiveAboutAI: true },
    { id: 'other', score: 6 },
    { id: 'notDetailed', score: 7 },
    { id: 'confusing', score: 8 },
    { id: 'irrelevant', score: 9 },
    { id: 'brokenLink', score: 10 },
  ]
};

/**
 * Score-to-key lookup for dashboard/metrics
 * Maps publicFeedbackScore (number) to publicFeedbackReason key (string)
 */
export const SCORE_TO_KEY = {};
FEEDBACK_OPTIONS.YES.forEach(opt => { SCORE_TO_KEY[opt.score] = opt.id; });
FEEDBACK_OPTIONS.NO.forEach(opt => { SCORE_TO_KEY[opt.score] = opt.id; });

/**
 * Scores that reflect positive feedback about the AI answer, regardless of the
 * user's yes/no click. All YES options are positive; among NO options only
 * those flagged `positiveAboutAI` (notWanted) count as positive — the answer
 * was good, the user just disliked the real-world outcome. This is the basis
 * for the helpful/unhelpful split on the metrics dashboards (not the raw
 * `feedback` field, which conflates the two).
 */
export const POSITIVE_SCORES = new Set([
  ...FEEDBACK_OPTIONS.YES.map(opt => opt.score),
  ...FEEDBACK_OPTIONS.NO.filter(opt => opt.positiveAboutAI).map(opt => opt.score),
]);

export const isPositiveScore = (score) => POSITIVE_SCORES.has(Number(score));