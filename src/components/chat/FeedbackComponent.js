import React, { useState } from "react";
import ExpertFeedbackComponent from "./ExpertFeedbackComponent.js";
import PublicFeedbackComponent from "./PublicFeedbackComponent.js";
import { useHasAnyRole } from "../RoleBasedUI.js";
import "../../styles/App.css";
import { useTranslations } from "../../hooks/useTranslations.js";
import FeedbackService from "../../services/FeedbackService.js";

const FeedbackComponent = ({
  lang = "en",
  sentenceCount = 1,
  chatId,
  userMessageId,
  sentences = [],
  // Add these new props for the skip button
  showSkipButton = false, // Determines if skip button should be shown
  onSkip = () => { }, // Function to call when skip button is clicked
  skipButtonLabel = "", // Accessible label for the skip button
}) => {
  const { t } = useTranslations(lang);
  const [feedbackGiven, setFeedbackGiven] = useState(false);
  const [feedbackError] = useState(false);
  const [showExpertRating, setShowExpertRating] = useState(false);
  const [showPublicRating, setShowPublicRating] = useState(false);
  const [publicPositive, setPublicPositive] = useState(true);
  const hasExpertRole = useHasAnyRole(["admin", "partner"]);

  const handleFeedback = (isPositive) => {
    let feedbackPayload = null;
    if (isPositive) {
      if (hasExpertRole) {
        feedbackPayload = {
          type: "expert",
          feedback: "positive",
          totalScore: 100,
        };
        FeedbackService.persistExpertFeedback({
          chatId,
          interactionId: userMessageId,
          expertFeedback: feedbackPayload,
        });
        setFeedbackGiven(true);
      } else {
        setPublicPositive(true);
        setShowPublicRating(true);
      }
    } else {
      if (hasExpertRole) {
        setShowExpertRating(true);
      } else {
        setPublicPositive(false);
        setShowPublicRating(true);
      }
    }
  };
  const handleExpertFeedback = (expertFeedback) => {
    console.log("Expert feedback received:", expertFeedback);
    const feedbackWithType = {
      ...expertFeedback,
      type: "expert",
    };
    setShowExpertRating(false);
    FeedbackService.persistExpertFeedback({
      chatId,
      interactionId: userMessageId,
      expertFeedback: feedbackWithType,
    });
    setFeedbackGiven(true);
  };

  const handlePublicFeedback = (publicFeedback) => {
    FeedbackService.persistPublicFeedback({
      chatId,
      interactionId: userMessageId,
      publicFeedback,
    });
    setFeedbackGiven(true);
    setShowPublicRating(false);
  };

  if (feedbackGiven) {
    return (
      <p className="thank-you">
        <span className="gcds-icon fa fa-solid fa-check-circle"></span>
        {t("homepage.feedback.thankYou")}
      </p>
    );
  }
  if (feedbackError) {
    return (
      <p className="feedback-error">
        <span
          className="gcds-icon fa fa-solid fa-exclamation-circle"
          style={{ color: "red" }}
        ></span>
        Error submitting feedback, contact admin.
      </p>
    );
  }
  if (showExpertRating) {
    return (
      <ExpertFeedbackComponent
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
        <span className="feedback-text">
          {t("homepage.publicFeedback.question")}
        </span>
        <span className="feedback-buttons">
          <button
            className="feedback-link button-as-link link-default hover:link-hover"
            onClick={() => handleFeedback(true)}
            tabIndex="0"
          >
            {t("common.yes", "Yes")}
          </button>
          <span className="feedback-separator">·</span>
          <button
            className="feedback-link button-as-link link-default hover:link-hover"
            onClick={() => handleFeedback(false)}
            tabIndex="0"
          >
            {t("common.no", "No")}
          </button>
        </span>
        {showSkipButton && (
          <>
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
      <span className="feedback-text">{t("homepage.feedback.question")} </span>
      <button
        className="feedback-link button-as-link"
        onClick={() => handleFeedback(true)}
        tabIndex="0"
      >
        {t("homepage.feedback.useful")}
      </button>
      <span className="feedback-separator">·</span>
      <span className="feedback-text">{t("homepage.feedback.or")}</span>
      <span className="feedback-separator">·</span>
      <button
        className="feedback-link button-as-link"
        onClick={() => handleFeedback(false)}
        tabIndex="0"
      >
        {t("homepage.feedback.notUseful")}
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
