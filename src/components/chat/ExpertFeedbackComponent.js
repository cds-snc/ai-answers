import React, { useState, useId } from 'react';
import { useTranslations } from '../../hooks/useTranslations.js';
import { useInlineFormError } from '../../hooks/useInlineFormError.js';
import { useFocusOnChange } from '../../hooks/useFocusOnChange.js';
import { useAnswerNumberLabel } from '../../hooks/useAnswerNumberLabel.js';
import FeedbackInlineError from './FeedbackInlineError.js';
import ExplanationErrorSummary from './ExplanationErrorSummary.js';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { resolveDisplayContent, toLangAttr } from '../../utils/answerLanguage.js';
import OriginalLanguagePill from './review/OriginalLanguagePill.js';

// Shows ratings for a maximum of 4 sentences, and for the citation score
// if there are somehow 5 sentences, the 5th sentence is ignored _YES THIS IS A HACK

const ExpertFeedbackComponent = ({
  onSubmit,
  onClose,
  lang = 'en',
  sentenceCount = 1,
  sentences = [],
  questionLanguage = '',
  sentencesEnglish = [],
  answerNumber,
  citationUrl,
  department,
  titleRef,
}) => {
  const { t } = useTranslations(lang);
  // Namespaces every id in this component so multiple instances can render on
  // one page (e.g. review mode, one per un-rated answer) without colliding.
  const uid = useId();
  const { answerText, withAnswerNumber } = useAnswerNumberLabel(t, answerNumber);
  const [expertFeedback, setExpertFeedback] = useState({
    sentence1Score: null,
    sentence1Explanation: '',
    sentence1Harmful: false,
    sentence1ContentIssue: false,
    sentence2Score: null,
    sentence2Explanation: '',
    sentence2Harmful: false,
    sentence2ContentIssue: false,
    sentence3Score: null,
    sentence3Explanation: '',
    sentence3Harmful: false,
    sentence3ContentIssue: false,
    sentence4Score: null,
    sentence4Explanation: '',
    sentence4Harmful: false,
    sentence4ContentIssue: false,
    citationScore: null,
    citationExplanation: '',
    expertCitationUrl: '',
  });
  const { hasError, errorCount, errorRef, triggerError, clearError } = useInlineFormError();

  // Explanation is required whenever a sentence/citation is scored anything
  // other than "good" (the textarea only ever renders in that case).
  //
  // flaggedExplanationFields is a *snapshot* of which fields were missing at
  // the moment of the last failed submit — not a live "is this field
  // currently missing" flag. That distinction matters: without it, rating a
  // field for the first time (e.g. sentence 2, after an earlier failed
  // submit over sentence 1) would make its explanation box appear already
  // in an error state, before the reviewer ever got a chance to fill it in.
  // Only fields that were actually part of a failed submit attempt — and
  // are still unfilled — show an error; anything newly revealed since then
  // stays quiet until the next submit attempt evaluates it too.
  const [submitAttemptCount, setSubmitAttemptCount] = useState(0);
  const [flaggedExplanationFields, setFlaggedExplanationFields] = useState([]);
  // Shared ref: attached to whichever single element should take focus on a
  // failed submit — the summary (2+ errors) or the one field's own error
  // message (exactly 1) — see where each is assigned below.
  const explanationErrorRef = useFocusOnChange(submitAttemptCount);

  // Field-key-driven ('sentence1'..'sentence4' or 'citation') rather than a
  // separate near-duplicate pair of functions per entity — matches the same
  // addressing scheme already used everywhere else in this file
  // (missingExplanationFields, explanationFieldLabel, explanationErrorMessage).
  const scoreFieldFor = (key) => key === 'citation' ? 'citationScore' : `${key}Score`;
  const explanationFieldFor = (key) => key === 'citation' ? 'citationExplanation' : `${key}Explanation`;
  const badScoresFor = (key) => key === 'citation' ? [20, 0] : [80, 0];

  const explanationRequiredFor = (key) => badScoresFor(key).includes(expertFeedback[scoreFieldFor(key)]);
  const isExplanationMissing = (key) => explanationRequiredFor(key) && !expertFeedback[explanationFieldFor(key)].trim();

  // Document order: sentences first, then citation. Used both to decide
  // submit-time blocking (every currently-missing field) and, further down,
  // to decide which single field gets focused when more than one is flagged.
  const sentenceIndices = [...Array(Math.min(4, sentenceCount))].map((_, i) => i + 1);
  const explanationFieldKeys = [...sentenceIndices.map((i) => `sentence${i}`), 'citation'];
  const missingExplanationFields = explanationFieldKeys.filter(isExplanationMissing);

  // What's actually shown as an error: fields flagged by the last failed
  // submit attempt that are *still* missing (re-filtered live so an error
  // clears the moment its field is filled in, same as before) — never a
  // field that's newly missing but hasn't been part of a submit attempt yet.
  const visibleExplanationErrors = flaggedExplanationFields.filter(isExplanationMissing);
  // Only set (and thus only auto-focused) in the single-error case — once
  // there's more than one, focus goes to the summary instead, see the
  // summaryRef effect below.
  const firstVisibleExplanationError = visibleExplanationErrors.length === 1 ? visibleExplanationErrors[0] : null;
  // With only one field in error, its own field name is visually redundant
  // (the message sits right beside the one field it can possibly refer to) —
  // shown only once there's more than one, to disambiguate between them.
  // Screen reader users still get it either way, via .wb-inv when hidden.
  const showFieldInMessage = visibleExplanationErrors.length > 1;

  // Shared label per field key, reused by the per-field error message and
  // the summary's jump links below, so all three always agree.
  const explanationFieldLabel = (key) =>
    key === 'citation' ? t('homepage.expertRating.citation') : t(`homepage.expertRating.${key}`);
  // Two distinct templates rather than one with the field toggled in/out —
  // hiding {field} inside a single "...required: {field}" template left a
  // dangling colon with nothing visibly after it in the single-error case.
  // With >1 error, splits the translated "Explanation is required: {field}"
  // template around its placeholder, so the field name can be inserted
  // without ever hardcoding the surrounding punctuation ourselves (the
  // colon/spacing stays entirely inside the locale string, correct per
  // language either way). With exactly 1 error, the plain sentence is used
  // and the field name still appended for screen readers only (.wb-inv) —
  // never omitted, just not visibly duplicated next to its own field.
  const explanationErrorMessage = (key) => {
    const fieldLabel = explanationFieldLabel(key);
    if (showFieldInMessage) {
      const [before, after = ''] = t('homepage.expertRating.explanationRequiredField').split('{field}');
      return <>{before}{fieldLabel}{after}</>;
    }
    return (
      <>
        {t('homepage.expertRating.explanationRequired')}
        <span className="wb-inv"> {fieldLabel}</span>
      </>
    );
  };

  // Only worth a jump-link summary once there's more than one problem to
  // navigate between — a single missing field is already handled by its own
  // inline error + auto-focus.
  const explanationSummaryLinks = visibleExplanationErrors.length > 1
    ? visibleExplanationErrors.map((key) => ({
        fieldId: `${uid}-${key}-explanation`,
        label: explanationFieldLabel(key),
      }))
    : null;

  // Same EN/FR-official-languages display rule (shown as-is; non-EN/FR
  // collapses to English) as ExpertFeedbackPanel.js/ChatDashboardPage.js
  // (resolveDisplayContent) -
  // questionLanguage drives every sentence uniformly, since the AI answers
  // in whatever language was detected for the question (agenticBase.js),
  // not a separately-tracked language per sentence. Resolved once here
  // (not inside the .map() below) since sentences[index] is also read
  // directly for the aria-describedby presence check.
  const sentenceDisplays = sentences.map((sentence, index) =>
    resolveDisplayContent({ language: questionLanguage, original: sentence, english: sentencesEnglish[index] })
  );
  const isSource = sentenceDisplays.some((d) => d.isSource);

  const handleRadioChange = (event) => {
    const { name, value } = event.target;
    const sentenceNumber = name.replace('Score', '');
    const numericValue = parseInt(value);
    const updates = {
      [name]: numericValue,
      [`${sentenceNumber}Harmful`]: false, // Always reset harmful when changing score
    };

    // Clear stale text when the new score no longer needs an explanation —
    // otherwise a reviewer who types one then changes their mind back to
    // "good" would silently submit (and the review panel would display)
    // leftover text alongside a "good" score. expertCitationUrl rides along
    // with citationScore specifically, since its field is also now hidden
    // once citationScore stops needing it.
    const needsExplanation = name === 'citationScore'
      ? (numericValue === 20 || numericValue === 0)
      : (numericValue === 80 || numericValue === 0);
    if (!needsExplanation) {
      updates[`${sentenceNumber}Explanation`] = '';
      if (name === 'citationScore') {
        updates.expertCitationUrl = '';
      }
    }

    setExpertFeedback((prev) => ({ ...prev, ...updates }));
    clearError();
  };

  const handleInputChange = (event) => {
    const { name, value } = event.target;
    setExpertFeedback((prev) => ({ ...prev, [name]: value }));
  };

  const handleCheckboxChange = (event) => {
    const { name, checked } = event.target;
    setExpertFeedback((prev) => ({ ...prev, [name]: checked }));
  };

  // Prevent form submission on enter key press inside text areas
  const handleKeyPress = (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
    }
  };

  const hasAnyRating = (feedback) =>
    [
      feedback.sentence1Score,
      feedback.sentence2Score,
      feedback.sentence3Score,
      feedback.sentence4Score,
      feedback.citationScore,
    ].some((score) => score !== null);

  const handleSubmit = (event) => {
    event.preventDefault();

    if (!hasAnyRating(expertFeedback)) {
      triggerError();
      return;
    }
    clearError();

    if (missingExplanationFields.length > 0) {
      setFlaggedExplanationFields(missingExplanationFields);
      setSubmitAttemptCount((n) => n + 1);
      return;
    }

    const totalScore = computeTotalScore(expertFeedback);


    const feedbackWithScore = {
      ...expertFeedback,
      totalScore,
      feedback: 'negative',
    };

    console.log('Submitting expert feedback:', feedbackWithScore);
    onSubmit(feedbackWithScore);
  };

  const computeTotalScore = (feedback) => {
    // Get scores for existing sentences (up to sentenceCount)
    const sentenceScores = [
      feedback.sentence1Score,
      feedback.sentence2Score,
      feedback.sentence3Score,
      feedback.sentence4Score,
    ]
      .slice(0, sentenceCount)
      .map((score) => (score === null ? 100 : score)); // Unrated sentences = 100

    // Calculate sentence component
    const sentenceComponent =
      (sentenceScores.reduce((sum, score) => sum + score, 0) / sentenceScores.length) * 0.75;

    // Citation score defaults to 25 (good) in two cases:
    // 1. Citation exists but wasn't rated
    // 2. Answer has no citation section at all and the reviewer didn't rate the
    //    absence either — an edge case, since whether "no citation" is good, needs
    //    improvement, or incorrect depends on whether the answer warranted one.
    //    The rating radios stay available either way so a reviewer CAN score the
    //    absence explicitly; this default only covers the case where they didn't.
    const citationComponent = feedback.citationScore !== null ? feedback.citationScore : 25;

    const totalScore = sentenceComponent + citationComponent;

    return Math.round(totalScore * 100) / 100;
  };

  return (
    // TODO: review and confirm — noValidate was added for the required
    // explanation textareas' custom validation, but it also silently drops
    // native format checking on the unrelated, unrequired expertCitationUrl
    // (type="url") input, with no replacement check in its place. Confirm
    // whether that's an acceptable gap (optional field, trusted admin
    // input) before adding a replacement check — not adding one blind.
    <form onSubmit={handleSubmit} className="expert-rating-container" noValidate lang={lang}>
      <FontAwesomeIcon
        icon="fa-solid fa-close"
        className="close-icon"
        onClick={onClose}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onClose();
          }
        }}
        role="button"
        tabIndex={0}
        aria-label={t('common.close')}
      />
      <fieldset className={`gc-chckbxrdio md expert-rating-fieldset${hasError ? ' has-error' : ''}`}>
        <h4 className="feedback-followup-title" ref={titleRef} tabIndex={-1}>
          {t('homepage.expertRating.intro')}
          {answerNumber && (
            <span className="feedback-answer-number">{answerText}</span>
          )}
        </h4>
        {isSource && (
          <div className="mb-100">
            <OriginalLanguagePill languageCode={toLangAttr(questionLanguage)} lang={lang} t={t} />
          </div>
        )}
        {explanationSummaryLinks && (
          <ExplanationErrorSummary
            id={`${uid}-explanation-summary`}
            heading={t('common.errorSummaryHeading')}
            links={explanationSummaryLinks}
            errorCount={submitAttemptCount}
            inputRef={explanationErrorRef}
          />
        )}
        {hasError && (
          <FeedbackInlineError
            id={`${uid}-error`}
            message={t('homepage.expertRating.selectionRequired')}
            errorCount={errorCount}
            inputRef={errorRef}
          />
        )}
        <details className="answer-details" open>
          <summary>{withAnswerNumber(t('homepage.expertRating.title'))}</summary>

          {/* All sentences 1-4 */}
          {[...Array(Math.min(4, sentenceCount))].map((_, index) => (
            <fieldset
              key={index + 1}
              className="sentence-rating-group"
              aria-describedby={sentences[index] ? `${uid}-sentence${index + 1}-text` : undefined}
            >
              <legend>
                {t(`homepage.expertRating.sentence${index + 1}`)}
              </legend>
              {sentences[index] && (
                <div className="sentence-text mb-200" id={`${uid}-sentence${index + 1}-text`}>
                  "<span lang={sentenceDisplays[index].lang}>{sentenceDisplays[index].text}</span>"
                </div>
              )}
              <ul className="list-unstyled lst-spcd-2">
                <li className="radio">
                  <input
                    type="radio"
                    name={`sentence${index + 1}Score`}
                    id={`${uid}-sentence${index + 1}-100`}
                    value="100"
                    checked={expertFeedback[`sentence${index + 1}Score`] === 100}
                    onChange={handleRadioChange}
                  />
                  <label htmlFor={`${uid}-sentence${index + 1}-100`}>
                    {t('homepage.expertRating.options.good')} (100)
                  </label>
                </li>
                <li className="radio">
                  <input
                    type="radio"
                    name={`sentence${index + 1}Score`}
                    id={`${uid}-sentence${index + 1}-80`}
                    value="80"
                    checked={expertFeedback[`sentence${index + 1}Score`] === 80}
                    onChange={handleRadioChange}
                  />
                  <label htmlFor={`${uid}-sentence${index + 1}-80`}>
                    {t('homepage.expertRating.options.needsImprovement')} (80)
                  </label>
                </li>
                <li className="radio">
                  <input
                    type="radio"
                    name={`sentence${index + 1}Score`}
                    id={`${uid}-sentence${index + 1}-0`}
                    value="0"
                    checked={expertFeedback[`sentence${index + 1}Score`] === 0}
                    onChange={handleRadioChange}
                  />
                  <label htmlFor={`${uid}-sentence${index + 1}-0`}>
                    {t('homepage.expertRating.options.incorrect')} (0)
                  </label>
                </li>
                {/* Content Issue checkbox */}
                <li className="checkbox">
                  <input
                    type="checkbox"
                    name={`sentence${index + 1}ContentIssue`}
                    id={`${uid}-sentence${index + 1}-content-issue`}
                    checked={expertFeedback[`sentence${index + 1}ContentIssue`]}
                    onChange={handleCheckboxChange}
                  />
                  <label htmlFor={`${uid}-sentence${index + 1}-content-issue`}
                  >{t('homepage.expertRating.options.contentIssue')}</label>
                </li>
                {expertFeedback[`sentence${index + 1}Score`] === 0 && (
                  <li className="checkbox">
                    <input
                      type="checkbox"
                      name={`sentence${index + 1}Harmful`}
                      id={`${uid}-sentence${index + 1}-harmful`}
                      aria-describedby={`${uid}-sentence${index + 1}-harmful-details-summary`}
                      checked={expertFeedback[`sentence${index + 1}Harmful`]}
                      onChange={handleCheckboxChange}
                    />
                    <label htmlFor={`${uid}-sentence${index + 1}-harmful`}
                    >{t('homepage.expertRating.options.harmful')} <span aria-hidden="true">*</span></label>
                    <details className="harmful-details mt-100 mb-200 details-form">
                      <summary id={`${uid}-sentence${index + 1}-harmful-details-summary`}><span aria-hidden="true" className="harmful-summary-marker">*</span>{t('homepage.expertRating.options.harmfulDetails.summary')}</summary>
                      <p className="mb-100 mt-100">{t('homepage.expertRating.options.harmfulDetails.intro')}</p>
                      <p className="mb-100">{t('homepage.expertRating.options.harmfulDetails.description')}</p>
                      <ul className="mb-200 list-disc canada-ca-list-spcd-2">
                        <li>{t('homepage.expertRating.options.harmfulDetails.item1')}</li>
                        <li>{t('homepage.expertRating.options.harmfulDetails.item2')}</li>
                        <li>{t('homepage.expertRating.options.harmfulDetails.item3')}</li>
                        <li>{t('homepage.expertRating.options.harmfulDetails.item4')}</li>
                        <li>{t('homepage.expertRating.options.harmfulDetails.item5')}</li>
                        <li>{t('homepage.expertRating.options.harmfulDetails.item6')}</li>
                      </ul>
                    </details>
                  </li>
                )}
              </ul>
              {explanationRequiredFor(`sentence${index + 1}`) && (
                <div className="explanation-field">
                  {visibleExplanationErrors.includes(`sentence${index + 1}`) && (
                    <FeedbackInlineError
                      id={`${uid}-sentence${index + 1}-explanation-error`}
                      message={explanationErrorMessage(`sentence${index + 1}`)}
                      errorCount={submitAttemptCount}
                      inputRef={firstVisibleExplanationError === `sentence${index + 1}` ? explanationErrorRef : undefined}
                      announce={!explanationSummaryLinks}
                    />
                  )}
                  <label htmlFor={`${uid}-sentence${index + 1}-explanation`}>
                    {t('homepage.expertRating.options.explanation')}
                    <textarea
                      id={`${uid}-sentence${index + 1}-explanation`}
                      name={`sentence${index + 1}Explanation`}
                      value={expertFeedback[`sentence${index + 1}Explanation`]}
                      onChange={handleInputChange}
                      onKeyDown={handleKeyPress}
                      required
                      aria-required="true"
                      aria-invalid={visibleExplanationErrors.includes(`sentence${index + 1}`) ? 'true' : undefined}
                      aria-describedby={visibleExplanationErrors.includes(`sentence${index + 1}`) ? `${uid}-sentence${index + 1}-explanation-error` : undefined}
                    />
                  </label>
                </div>
              )}
            </fieldset>
          ))}
        </details>

        <details className="citation-details">
          <summary>{withAnswerNumber(t('homepage.expertRating.citation'))}</summary>
          <fieldset className="citation-rating-group" aria-describedby={`${uid}-citation-text`}>
            <legend>{t('homepage.expertRating.citation')}</legend>
            {/* The radios below still apply when there's no citation — a reviewer
                can rate its absence as good, needs improvement, or incorrect
                (e.g. an answer that should have cited a source but didn't). */}
            <div className="citation-text mb-200" id={`${uid}-citation-text`}>
              {citationUrl || t('homepage.expertRating.citationNoneProvided')}
            </div>
            <ul className="list-unstyled lst-spcd-2">
              <li className="radio">
                <input
                  type="radio"
                  name="citationScore"
                  id={`${uid}-citation-25`}
                  value="25"
                  checked={expertFeedback.citationScore === 25}
                  onChange={handleRadioChange}
                />
                <label htmlFor={`${uid}-citation-25`}>{t('homepage.expertRating.options.good')} (25)</label>
              </li>
              <li className="radio">
                <input
                  type="radio"
                  name="citationScore"
                  id={`${uid}-citation-20`}
                  value="20"
                  checked={expertFeedback.citationScore === 20}
                  onChange={handleRadioChange}
                />
                <label htmlFor={`${uid}-citation-20`}>
                  {t('homepage.expertRating.options.needsImprovement')} (20)
                </label>
              </li>
              <li className="radio">
                <input
                  type="radio"
                  name="citationScore"
                  id={`${uid}-citation-0`}
                  value="0"
                  checked={expertFeedback.citationScore === 0}
                  onChange={handleRadioChange}
                />
                <label htmlFor={`${uid}-citation-0`}>
                  {t('homepage.expertRating.options.incorrect')} (0)
                </label>
              </li>
            </ul>
            {explanationRequiredFor('citation') && (
              <div className="explanation-field">
                {visibleExplanationErrors.includes('citation') && (
                  <FeedbackInlineError
                    id={`${uid}-citation-explanation-error`}
                    message={explanationErrorMessage('citation')}
                    errorCount={submitAttemptCount}
                    inputRef={firstVisibleExplanationError === 'citation' ? explanationErrorRef : undefined}
                    announce={!explanationSummaryLinks}
                  />
                )}
                <label htmlFor={`${uid}-citation-explanation`}>
                  {t('homepage.expertRating.options.explanation')}
                  <textarea
                    id={`${uid}-citation-explanation`}
                    name="citationExplanation"
                    value={expertFeedback.citationExplanation}
                    onChange={handleInputChange}
                    onKeyDown={handleKeyPress}
                    required
                    aria-required="true"
                    aria-invalid={visibleExplanationErrors.includes('citation') ? 'true' : undefined}
                    aria-describedby={visibleExplanationErrors.includes('citation') ? `${uid}-citation-explanation-error` : undefined}
                  />
                </label>
              </div>
            )}
          </fieldset>

          {explanationRequiredFor('citation') && (
            <div className="explanation-field">
              <label className="expert-citation-url" htmlFor={`${uid}-expert-citation-url`}>
                {t('homepage.expertRating.options.betterCitation')}
                <input
                  type="url"
                  id={`${uid}-expert-citation-url`}
                  name="expertCitationUrl"
                  value={expertFeedback.expertCitationUrl}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyPress}
                />
              </label>
            </div>
          )}
        </details>
      </fieldset>
      <button type="submit" className="btn-primary mrgn-lft-sm">
        {withAnswerNumber(t('homepage.expertRating.submit'))}
        {department ? ` - ${department}` : ''}
      </button>
    </form>
  );
};

export default ExpertFeedbackComponent;
