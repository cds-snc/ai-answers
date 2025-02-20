import React, { useState } from 'react';
import ExpertRatingComponent from './ExpertRatingComponent.js';
import '../../styles/App.css';
import { useTranslations } from '../../hooks/useTranslations.js';
import { DataStoreService } from '../../services/DataStoreService.js';

const FeedbackComponent = ({ lang = 'en', sentenceCount = 1, chatId, userMessageId }) => {
  const { t } = useTranslations(lang);
  const [feedbackGiven, setFeedbackGiven] = useState(false);
  const [showExpertRating, setShowExpertRating] = useState(false);

  const handleFeedback = (isPositive) => {
    if (isPositive) {
      const expertFeedback = {
        totalScore: 100,
        isPositive: true,
      };
      setFeedbackGiven(true);
      DataStoreService.persistFeedback(expertFeedback, chatId, userMessageId);
    } else {
      setShowExpertRating(true);
    }
  };

  const handleExpertFeedback = (expertFeedback) => {
    console.log('Expert feedback received:', expertFeedback);
    setFeedbackGiven(true);
    setShowExpertRating(false);
    DataStoreService.persistFeedback(expertFeedback, chatId, userMessageId);
  };

  if (feedbackGiven) {
    return (
      <p className="thank-you">
        <span className="gcds-icon fa fa-solid fa-check-circle"></span>
        {t('homepage.feedback.thankYou')}
      </p>
    );
  }
  if (showExpertRating) {
    return (
      <ExpertRatingComponent
        onSubmit={handleExpertFeedback}
        onClose={() => setShowExpertRating(false)}
        lang={lang}
        sentenceCount={sentenceCount}
      />
    );
  }
  return (
    <div className="feedback-container">
      <span className="feedback-text">{t('homepage.feedback.question')} </span>
      <button className="feedback-link button-as-link" onClick={() => handleFeedback(true)}>
        {t('homepage.feedback.useful')}
      </button>
      <span className="feedback-separator">·</span>
      <span className="feedback-text">{t('homepage.feedback.or')}</span>
      <span className="feedback-separator">·</span>
      <button className="feedback-link button-as-link" onClick={() => handleFeedback(false)}>
        {t('homepage.feedback.notUseful')}
      </button>
    </div>
  );
};

export default FeedbackComponent;
