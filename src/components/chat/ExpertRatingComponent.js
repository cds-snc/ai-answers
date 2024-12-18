import React, { useState } from 'react';
import { GcdsFieldset } from '@cdssnc/gcds-components-react';
import '../../styles/App.css';
import { useTranslations } from '../../hooks/useTranslations.js';

// TODO: Only show checkb sentences 2-4 if those sente

const ExpertRatingComponent = ({ onSubmit, lang = 'en' }) => {
  const { t } = useTranslations(lang);
  const [expertFeedback, setExpertFeedback] = useState({
    sentence1Score: null,
    sentence2Score: null,
    sentence3Score: null,
    sentence4Score: null,
    citationScore: null,
    answerImprovement: '',
    expertCitationUrl: '',
  });

  const handleRadioChange = (event) => {
    const { name, value } = event.target;
    setExpertFeedback(prev => ({ ...prev, [name]: parseInt(value) }));
  };

  const handleInputChange = (event) => {
    const { name, value } = event.target;
    setExpertFeedback(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    
    if (expertFeedback.expertCitationUrl && !isValidGovernmentUrl(expertFeedback.expertCitationUrl)) {
      alert(t('homepage.expertRating.errors.invalidUrl'));
      return;
    }
    
    console.log('Submitting expert feedback:', expertFeedback);
    onSubmit(expertFeedback);
  };

  const isValidGovernmentUrl = (url) => {
    try {
      const urlObject = new URL(url);
      return urlObject.hostname.includes('canada.ca') || 
             urlObject.hostname.includes('gc.ca');
    } catch {
      return false;
    }
  };

  const computeTotalScore = (feedback) => {
    // Get all sentence scores that exist and aren't null
    const sentenceScores = [
      feedback.sentence1Score,
      feedback.sentence2Score,
      feedback.sentence3Score,
      feedback.sentence4Score
    ].filter(score => score !== null);

    // If no sentences were rated, return 0
    if (sentenceScores.length === 0) return 0;

    // Calculate average of sentence scores and multiply by 0.75
    const sentenceComponent = (sentenceScores.reduce((sum, score) => sum + score, 0) / sentenceScores.length) * 0.75;
    
    // Citation score defaults to 25 (full marks) if not set
    const citationComponent = feedback.citationScore !== null ? feedback.citationScore : 25;

    // Simple addition since citation scores are already weighted
    const totalScore = sentenceComponent + citationComponent;
    
    // Round to 2 decimal places
    return Math.round(totalScore * 100) / 100;
  };

  return (
    <form onSubmit={handleSubmit} className="expert-rating-container">
      <GcdsFieldset
        legend={t('homepage.expertRating.title')}
        hint={t('homepage.expertRating.hint')}
        fieldsetId="ratings"
        className="mt-400"
      >
        <details className="answer-details">
          <summary>{t('homepage.expertRating.title')}</summary>
          {[1, 2, 3, 4].map((sentenceNum) => (
            <div key={sentenceNum} className="sentence-rating-group">
              <h3>{t(`homepage.expertRating.sentence${sentenceNum}`)}</h3>
              <div className="radio-group">
                <label>
                  <input
                    type="radio"
                    name={`sentence${sentenceNum}Score`}
                    value="100"
                    checked={expertFeedback[`sentence${sentenceNum}Score`] === 100}
                    onChange={handleRadioChange}
                  />
                  {t('homepage.expertRating.options.good')} (100)
                </label>
                <label>
                  <input
                    type="radio"
                    name={`sentence${sentenceNum}Score`}
                    value="80"
                    checked={expertFeedback[`sentence${sentenceNum}Score`] === 80}
                    onChange={handleRadioChange}
                  />
                  {t('homepage.expertRating.options.needsImprovement')} (80)
                </label>
                <label>
                  <input
                    type="radio"
                    name={`sentence${sentenceNum}Score`}
                    value="0"
                    checked={expertFeedback[`sentence${sentenceNum}Score`] === 0}
                    onChange={handleRadioChange}
                  />
                  {t('homepage.expertRating.options.incorrect')} (0)
                </label>
              </div>
            </div>
          ))}

          <div className="answer-improvement">
            <label>
              {t('homepage.expertRating.options.answerImprovement')}
              <textarea
                name="answerImprovement"
                value={expertFeedback.answerImprovement}
                onChange={handleInputChange}
              />
            </label>
          </div>
        </details>

        <details className="citation-details">
          <summary>{t('homepage.expertRating.citation')}</summary>
          <div className="citation-rating-group">
            <div className="radio-group">
              <label>
                <input
                  type="radio"
                  name="citationScore"
                  value="25"
                  checked={expertFeedback.citationScore === 25}
                  onChange={handleRadioChange}
                />
                {t('homepage.expertRating.options.good')} (25)
              </label>
              <label>
                <input
                  type="radio"
                  name="citationScore"
                  value="20"
                  checked={expertFeedback.citationScore === 20}
                  onChange={handleRadioChange}
                />
                {t('homepage.expertRating.options.needsImprovement')} (20)
              </label>
              <label>
                <input
                  type="radio"
                  name="citationScore"
                  value="0"
                  checked={expertFeedback.citationScore === 0}
                  onChange={handleRadioChange}
                />
                {t('homepage.expertRating.options.incorrect')} (0)
              </label>
            </div>
          </div>

          <div>
            <label>
              {t('homepage.expertRating.options.betterCitation')}
              <input
                type="url"
                name="expertCitationUrl"
                value={expertFeedback.expertCitationUrl}
                onChange={handleInputChange}
              />
            </label>
          </div>
        </details>
      </GcdsFieldset>
      <button type="submit">{t('homepage.expertRating.submit')}</button>
    </form>
  );
};

export default ExpertRatingComponent;