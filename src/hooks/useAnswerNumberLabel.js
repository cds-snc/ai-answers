// Appends "Answer N" to a label so identical controls/headings stay
// distinguishable when several instances (one per message) render on the
// same page at once — e.g. admin/partner review mode with several
// un-rated/reviewed messages open. Uses a colon rather than parens so it
// isn't visually conflated with score values shown in parens elsewhere
// (e.g. "Good (100)").
//
// Returns both the raw "Answer N" text (for standalone display) and
// withAnswerNumber (for appending it to an existing label).
export const useAnswerNumberLabel = (t, answerNumber) => {
  const answerText = answerNumber
    ? t('homepage.expertRating.answerNumberLabel').replace('{number}', answerNumber)
    : '';
  const withAnswerNumber = (label) => (answerNumber ? `${label}: ${answerText}` : label);
  return { answerText, withAnswerNumber };
};
