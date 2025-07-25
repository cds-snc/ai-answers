import React, { useState } from 'react';
import ExpertRatingComponent from './ExpertRatingComponent.js';
import PublicFeedbackComponent from './PublicFeedbackComponent.js';
import { useHasAnyRole } from '../RoleBasedUI.js';
import '../../styles/App.css';
import { useTranslations } from '../../hooks/useTranslations.js';
import DataStoreService from '../../services/DataStoreService.js';

const FeedbackComponent = ({
  lang = 'en',
  sentenceCount = 1,
  chatId,
  userMessageId,
  sentences = [],
  // Add these new props for the skip button
  showSkipButton = false,  // Determines if skip button should be shown
  onSkip = () => { },       // Function to call when skip button is clicked
  skipButtonLabel = ''     // Accessible label for the skip button
}) => {
  const { t } = useTranslations(lang);
  const [feedbackGiven, setFeedbackGiven] = useState(false);
  const [showExpertRating, setShowExpertRating] = useState(false);
  const [showPublicRating, setShowPublicRating] = useState(false);
  const [publicPositive, setPublicPositive] = useState(true);
  const hasExpertRole = useHasAnyRole(['admin', 'partner']);

  const handleFeedback = (isPositive) => {
    let feedbackPayload = null; // Renamed to avoid confusion
    if (isPositive) {
      if (hasExpertRole) {
        feedbackPayload = {
          // totalScore: 100, // Retained for now, can be re-evaluated if it causes issues
          type: 'expert',
          feedback: 'positive', // Explicitly 'positive' for expert "Useful" click
          totalScore: 100, // Assuming a default score of 100 for positive feedback
        };
        DataStoreService.persistFeedback(feedbackPayload, chatId, userMessageId);
        setFeedbackGiven(true);
      } else {
        setPublicPositive(true);
        setShowPublicRating(true);
      }
    } else { // Not useful / No
      if (hasExpertRole) {
        // When "Not Useful" is clicked by an expert, show the detailed rating component.
        // The ExpertRatingComponent will then determine its own 'positive'/'negative' feedback string.
        setShowExpertRating(true);
      } else {
        setPublicPositive(false);
        setShowPublicRating(true);
      }
    }
  };
  const handleExpertFeedback = (expertFeedback) => {
    console.log('Expert feedback received:', expertFeedback);
    const feedbackWithType = {
      ...expertFeedback,
      type: 'expert'
    };
    setFeedbackGiven(true);
    setShowExpertRating(false);
    DataStoreService.persistFeedback(feedbackWithType, chatId, userMessageId);
  };

  const handlePublicFeedback = (publicFeedback) => {
    setFeedbackGiven(true);
    setShowPublicRating(false);
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
        sentences={sentences}
      />
    );
  }

  if (showPublicRating) {
    return (
      <PublicFeedbackComponent
        lang={lang}
        isPositive={publicPositive}
        chatId={chatId}
        userMessageId={userMessageId}
        onSubmit={handlePublicFeedback}
        onClose={() => setShowPublicRating(false)}
      />
    );
  }

  // Show public mode question: Was this helpful? Yes No
  if (!hasExpertRole) {
    return (
      <div className="feedback-container">
        <span className="feedback-text">{t('homepage.publicFeedback.question')}</span>
        <button className="feedback-link button-as-link" onClick={() => handleFeedback(true)} tabIndex="0">
          {t('common.yes', 'Yes')}
        </button>
        <span className="feedback-separator">·</span>
        <button className="feedback-link button-as-link" onClick={() => handleFeedback(false)} tabIndex="0">
          {t('common.no', 'No')}
        </button>
        {showSkipButton && (
          <>
            <span className="feedback-separator"></span>
            <button
              className="wb-inv"
              onClick={onSkip}
              aria-label={skipButtonLabel}
              tabIndex="0"
            >
              {skipButtonLabel}
            </button>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="feedback-container">
      <span className="feedback-text">{t('homepage.feedback.question')} </span>
      <button className="feedback-link button-as-link" onClick={() => handleFeedback(true)} tabIndex="0">
        {t('homepage.feedback.useful')}
      </button>
      <span className="feedback-separator">·</span>
      <span className="feedback-text">{t('homepage.feedback.or')}</span>
      <span className="feedback-separator">·</span>
      <button className="feedback-link button-as-link" onClick={() => handleFeedback(false)} tabIndex="0">
        {t('homepage.feedback.notUseful')}
      </button>

      {/* Add the skip button after the other buttons, in the same line */}
      {showSkipButton && (
        <>
          <span className="feedback-separator"></span>
          <button
            className="wb-inv"
            onClick={onSkip}
            aria-label={skipButtonLabel}
            tabIndex="0"
          >
            {skipButtonLabel}
          </button>
        </>
      )}
    </div>
  );
};

export default FeedbackComponent;