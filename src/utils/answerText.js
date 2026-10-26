/**
 * Shared helpers for displaying raw stored answer/question text to a human
 * reviewer. Pure utility — no React, no state.
 */

// Strip sentence markers the pipeline adds for per-sentence citation/scoring
// (e.g. <s-1>...</s-1>) and collapse whitespace so they never leak into a
// human-facing view. Originally lived only in utils/experimental/wordDiff.js;
// promoted here once a second (non-experimental) feature needed the same
// stripping, per this repo's "cross-feature helper -> shared location"
// convention.
export const normalizeAnswerText = (text) => String(text || '')
    .replace(/<\/?s-\d+>/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
