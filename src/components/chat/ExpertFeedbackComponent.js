import React, { useState } from 'react';
import '../../styles/App.css';
import { useTranslations } from '../../hooks/useTranslations.js';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

// Shows ratings for a maximum of 4 sentences, and for the citation score
// if there are somehow 5 sentences, the 5th sentence is ignored _YES THIS IS A HACK

const ExpertFeedbackComponent = ({
  onSubmit,
  onClose,
  lang = 'en',
  sentenceCount = 1,
  sentences = [],
}) => {
  const { t } = useTranslations(lang);
  const [expertFeedback, setExpertFeedback] = useState({
    sentence1Score: null,
    sentence1Explanation: '',
    sentence1Harmful: false,
    sentence2Score: null,
    sentence2Explanation: '',
    sentence2Harmful: false,
    sentence3Score: null,
    sentence3Explanation: '',
    sentence3Harmful: false,
    sentence4Score: null,
    sentence4Explanation: '',
    sentence4Harmful: false,
    citationScore: null,
    citationExplanation: '',
    expertCitationUrl: '',
  });

  const handleRadioChange = (event) => {
    const { name, value } = event.target;
    const sentenceNumber = name.replace('Score', '');
    const updates = {
      [name]: parseInt(value),
      [`${sentenceNumber}Harmful`]: false, // Always reset harmful when changing score
    };

    setExpertFeedback((prev) => ({ ...prev, ...updates }));
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

  const handleSubmit = (event) => {
    event.preventDefault();

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
    // Check if any ratings were provided at all
    const hasAnyRating = [
      feedback.sentence1Score,
      feedback.sentence2Score,
      feedback.sentence3Score,
      feedback.sentence4Score,
      feedback.citationScore,
    ].some((score) => score !== null);

    // If no ratings were provided at all, return null
    if (!hasAnyRating) return null;

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
    // 2. Answer has no citation section at all
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
        aria-label="Close"
      />
      <fieldset className="gc-chckbxrdio sm-v">
        <h2>{t('homepage.expertRating.intro')}</h2>
        <details className="answer-details" open>
          <summary>{t('homepage.expertRating.title')}</summary>

          {/* All sentences 1-4 */}
          {[...Array(Math.min(4, sentenceCount))].map((_, index) => (
            <div key={index + 1} className="sentence-rating-group">
              <legend>
                {t(`homepage.expertRating.sentence${index + 1}`)}
                {sentences[index] && <div className="sentence-text">"{sentences[index]}"</div>}
              </legend>
              <ul className="list-unstyled lst-spcd-2">
                <li className="radio">
                  <input
                    type="radio"
                    name={`sentence${index + 1}Score`}
                    id={`sentence${index + 1}-100`}
                    value="100"
                    checked={expertFeedback[`sentence${index + 1}Score`] === 100}
                    onChange={handleRadioChange}
                  />
                  <label htmlFor={`sentence${index + 1}-100`}>
                    {t('homepage.expertRating.options.good')} (100)
                  </label>
                </li>
                <li className="radio">
                  <input
                    type="radio"
                    name={`sentence${index + 1}Score`}
                    id={`sentence${index + 1}-80`}
                    value="80"
                    checked={expertFeedback[`sentence${index + 1}Score`] === 80}
                    onChange={handleRadioChange}
                  />
                  <label htmlFor={`sentence${index + 1}-80`}>
                    {t('homepage.expertRating.options.needsImprovement')} (80)
                  </label>
                </li>
                <li className="radio">
                  <input
                    type="radio"
                    name={`sentence${index + 1}Score`}
                    id={`sentence${index + 1}-0`}
                    value="0"
                    checked={expertFeedback[`sentence${index + 1}Score`] === 0}
                    onChange={handleRadioChange}
                  />
                  <label htmlFor={`sentence${index + 1}-0`}>
                    {t('homepage.expertRating.options.incorrect')} (0)
                  </label>
                </li>
                {expertFeedback[`sentence${index + 1}Score`] === 0 && (
                  <li className="checkbox">
                    <input
                      type="checkbox"
                      name={`sentence${index + 1}Harmful`}
                      id={`sentence${index + 1}-harmful`}
                      checked={expertFeedback[`sentence${index + 1}Harmful`]}
                      onChange={handleCheckboxChange}
                    />
                    <label htmlFor={`sentence${index + 1}-harmful`}>
                      {t('homepage.expertRating.options.harmful')} (0)
                    </label>
                  </li>
                )}
              </ul>
              {(expertFeedback[`sentence${index + 1}Score`] === 80 ||
                expertFeedback[`sentence${index + 1}Score`] === 0) && (
                <div className="explanation-field">
                  <label htmlFor={`sentence${index + 1}-explanation`}>
                    {t('homepage.expertRating.options.explanation')}
                    <textarea
                      id={`sentence${index + 1}-explanation`}
                      name={`sentence${index + 1}Explanation`}
                      value={expertFeedback[`sentence${index + 1}Explanation`]}
                      onChange={handleInputChange}
                      onKeyDown={handleKeyPress}
                    />
                  </label>
                </div>
              )}
            </div>
          ))}
        </details>

        <details className="citation-details">
          <summary>{t('homepage.expertRating.citation')}</summary>
          <div className="citation-rating-group">
            <legend>{t('homepage.expertRating.citation')}</legend>
            <ul className="list-unstyled lst-spcd-2">
              <li className="radio">
                <input
                  type="radio"
                  name="citationScore"
                  id="citation-25"
                  value="25"
                  checked={expertFeedback.citationScore === 25}
                  onChange={handleRadioChange}
                />
                <label htmlFor="citation-25">{t('homepage.expertRating.options.good')} (25)</label>
              </li>
              <li className="radio">
                <input
                  type="radio"
                  name="citationScore"
                  id="citation-20"
                  value="20"
                  checked={expertFeedback.citationScore === 20}
                  onChange={handleRadioChange}
                />
                <label htmlFor="citation-20">
                  {t('homepage.expertRating.options.needsImprovement')} (20)
                </label>
              </li>
              <li className="radio">
                <input
                  type="radio"
                  name="citationScore"
                  id="citation-0"
                  value="0"
                  checked={expertFeedback.citationScore === 0}
                  onChange={handleRadioChange}
                />
                <label htmlFor="citation-0">
                  {t('homepage.expertRating.options.incorrect')} (0)
                </label>
              </li>
            </ul>
            {(expertFeedback.citationScore === 20 || expertFeedback.citationScore === 0) && (
              <div className="explanation-field">
                <label htmlFor="citation-explanation">
                  {t('homepage.expertRating.options.explanation')}
                  <textarea
                    id="citation-explanation"
                    name="citationExplanation"
                    value={expertFeedback.citationExplanation}
                    onChange={handleInputChange}
                    onKeyDown={handleKeyPress}
                  />
                </label>
              </div>
            )}
          </div>

          <div className="mrgn-bttm-lg">
            <label className="expert-citation-url" htmlFor="expert-citation-url">
              {t('homepage.expertRating.options.betterCitation')}
              <input
                type="url"
                id="expert-citation-url"
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
        {t('homepage.expertRating.submit')}
      </button>
    </form>
  );
};

export default ExpertFeedbackComponent;
