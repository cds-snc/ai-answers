import React, { useState, useId } from 'react';
import { useTranslations } from '../../hooks/useTranslations.js';
import { useInlineFormError } from '../../hooks/useInlineFormError.js';
import { useAnswerNumberLabel } from '../../hooks/useAnswerNumberLabel.js';
import FeedbackInlineError from './FeedbackInlineError.js';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

// Shows ratings for a maximum of 4 sentences, and for the citation score
// if there are somehow 5 sentences, the 5th sentence is ignored _YES THIS IS A HACK

const ExpertFeedbackComponent = ({
  onSubmit,
  onClose,
  lang = 'en',
  sentenceCount = 1,
  sentences = [],
  answerNumber,
  citationUrl,
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

  const handleRadioChange = (event) => {
    const { name, value } = event.target;
    const sentenceNumber = name.replace('Score', '');
    const updates = {
      [name]: parseInt(value),
      [`${sentenceNumber}Harmful`]: false, // Always reset harmful when changing score
    };

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
    <form onSubmit={handleSubmit} className="expert-rating-container">
      <FontAwesomeIcon
        icon="fa-solid fa-close"
        className="close-icon"
        onClick={onClose}
        onKeyDown={(e) => e.key === 'Enter' && onClose()}
        role="button"
        tabIndex={0}
        aria-label={t('common.close')}
      />
      <fieldset className={`gc-chckbxrdio md${hasError ? ' has-error' : ''}`}>
        <h4 className="feedback-followup-title">
          {t('homepage.expertRating.intro')}
          {answerNumber && (
            <span className="feedback-answer-number">{answerText}</span>
          )}
        </h4>
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
                  "{sentences[index]}"
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
                    <details className="harmful-details mt-100 mb-200">
                      <summary id={`${uid}-sentence${index + 1}-harmful-details-summary`}><span aria-hidden="true" className="harmful-summary-marker">*</span>{t('homepage.expertRating.options.harmfulDetails.summary')}</summary>
                      <p className="mb-100 mt-100">{t('homepage.expertRating.options.harmfulDetails.intro')}</p>
                      <p className="mb-100">{t('homepage.expertRating.options.harmfulDetails.description')}</p>
                      <ul className="mb-200 list-disc">
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
              {(expertFeedback[`sentence${index + 1}Score`] === 80 ||
                expertFeedback[`sentence${index + 1}Score`] === 0) && (
                  <div className="explanation-field">
                    <label htmlFor={`${uid}-sentence${index + 1}-explanation`}>
                      {t('homepage.expertRating.options.explanation')}
                      <textarea
                        id={`${uid}-sentence${index + 1}-explanation`}
                        name={`sentence${index + 1}Explanation`}
                        value={expertFeedback[`sentence${index + 1}Explanation`]}
                        onChange={handleInputChange}
                        onKeyDown={handleKeyPress}
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
            {(expertFeedback.citationScore === 20 || expertFeedback.citationScore === 0) && (
              <div className="explanation-field">
                <label htmlFor={`${uid}-citation-explanation`}>
                  {t('homepage.expertRating.options.explanation')}
                  <textarea
                    id={`${uid}-citation-explanation`}
                    name="citationExplanation"
                    value={expertFeedback.citationExplanation}
                    onChange={handleInputChange}
                    onKeyDown={handleKeyPress}
                  />
                </label>
              </div>
            )}
          </fieldset>

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
        </details>
      </fieldset>
      <button type="submit" className="btn-primary mrgn-lft-sm">
        {withAnswerNumber(t('homepage.expertRating.submit'))}
      </button>
    </form>
  );
};

export default ExpertFeedbackComponent;
