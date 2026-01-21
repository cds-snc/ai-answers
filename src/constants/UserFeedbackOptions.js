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
    { id: 'notWanted', score: 5 },
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