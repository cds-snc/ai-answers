import React, { useState, useRef, useEffect } from "react";
import ExpertFeedbackComponent from "./ExpertFeedbackComponent.js";
import PublicFeedbackComponent from "./PublicFeedbackComponent.js";
import SourceViewComponent from "./SourceViewComponent.js";
import { useHasAnyRole } from "../RoleBasedUI.js";
import { useTranslations } from "../../hooks/useTranslations.js";
import { useFocusOnChange } from "../../hooks/useFocusOnChange.js";
import { useReturnFocusOnClose } from "../../hooks/useReturnFocusOnClose.js";
import { useAnswerNumberLabel } from "../../hooks/useAnswerNumberLabel.js";
import { resolveDisplayContent } from "../../utils/answerLanguage.js";
import FeedbackService from "../../services/FeedbackService.js";

const FeedbackComponent = ({
  lang = "en",
  sentenceCount = 1,
  chatId,
  userMessageId,
  sentences = [],
  questionLanguage = "",
  sentencesEnglish = [],
  englishQuestion = "",
  answerNumber,
  citationUrl,
  department,
  // Add these new props for the skip link
  showSkipButton = false, // Determines if skip link should be shown
  onSkip = () => { }, // Function to call when skip link is activated
  skipButtonLabel = "", // Accessible label for the skip link
  skipToId = "message", // id of the element the skip link navigates to
  // Optional - only meaningful for the expert eval flow. Tells the parent
  // (ChatAppContainer.js, via ChatInterface.js) that this interaction's
  // expertFeedback changed, so `messages` state actually updates instead of
  // only the shared `message` object being mutated in place. See the
  // click-anywhere effect below for when this fires.
  onExpertFeedbackChange,
  // Optional - only set by ChatInterface.js for the one message whose
  // expert feedback was just deleted. This component doesn't get toggled
  // visible/hidden within one mounted instance for that case - it wasn't
  // rendered at all while expertFeedback existed (see the !expertFeedback
  // guard in ChatInterface.js), so this is a fresh mount, not a state
  // change on an existing one. A plain boolean would still work since a
  // fresh mount only happens once per reappearance, but a changing value
  // (Date.now(), from ChatAppContainer.js) is used anyway for consistency
  // with useFocusOnChange's counter convention elsewhere in this file.
  reappearedAfterDeleteNonce,
}) => {
  const { t } = useTranslations(lang);
  const { withAnswerNumber } = useAnswerNumberLabel(t, answerNumber);
  const [feedbackGiven, setFeedbackGiven] = useState(false);
  const [feedbackError] = useState(false);
  const [showExpertRating, setShowExpertRating] = useState(false);
  const [showPublicRating, setShowPublicRating] = useState(false);
  const [showSourceView, setShowSourceView] = useState(false);
  const [publicPositive, setPublicPositive] = useState(true);
  // Set only on the expert-eval submit path (quick "Yes" or the full rating
  // form) - holds the just-persisted feedback until the reviewer clicks
  // anywhere, at which point it's handed up via onExpertFeedbackChange so
  // this "Thank you" gives way to ExpertFeedbackPanel's read-only summary.
  // Not used for public feedback - there's no equivalent summary swap there.
  const [pendingExpertFeedback, setPendingExpertFeedback] = useState(null);
  const hasExpertRole = useHasAnyRole(["admin", "partner"]);
  const thankYouRef = useFocusOnChange(feedbackGiven);
  const expertRatingTitleRef = useFocusOnChange(showExpertRating);
  const publicRatingTitleRef = useFocusOnChange(showPublicRating);
  const sourceViewTitleRef = useFocusOnChange(showSourceView);
  const yesButtonRef = useRef(null);
  const noButtonRef = useRef(null);
  const viewSourceButtonRef = useRef(null);
  const usefulButtonRef = useRef(null);
  useReturnFocusOnClose(showExpertRating, noButtonRef);
  useReturnFocusOnClose(showPublicRating, publicPositive ? yesButtonRef : noButtonRef);
  useReturnFocusOnClose(showSourceView, viewSourceButtonRef);

  // Runs once per fresh mount triggered by an expert-feedback deletion (see
  // the reappearedAfterDeleteNonce prop comment) - focuses whichever of the
  // two possible first controls this render actually shows, since which one
  // exists depends on isSource. useEffect runs after the initial render too,
  // so the ref is already attached by the time this fires.
  useEffect(() => {
    if (!reappearedAfterDeleteNonce) return;
    (viewSourceButtonRef.current || usefulButtonRef.current)?.focus();
  }, [reappearedAfterDeleteNonce]);

  // Same EN/FR-official-languages rule (shown as-is; non-EN/FR collapses to
  // English) used everywhere else this displays (resolveDisplayContent,
  // src/utils/answerLanguage.js). "Review the English source text" only
  // makes sense to offer when there's actually AI Answers' own English
  // working text to show - i.e. the answer language isn't already EN/FR.
  // This is AI Answers' own source/working text, not a translation service -
  // don't reintroduce "translation" language here.
  //
  // TODO(sentence-pairing-risk): this is the highest-stakes consumer of the
  // sentences/sentencesEnglish pairing risk documented on resolveDisplayContent
  // (answerLanguage.js) - `isSource` here gates whether a reviewer sees
  // the mandatory "Review the English source text" step at all before rating
  // a non-EN/FR answer, not just a decorative pill. A naive fix that makes a
  // sentence-count mismatch fall back to `english: undefined` would flip this
  // to false and drop the reviewer straight into Good/Needs improvement on
  // text they can't read, with no indication anything was skipped - worse
  // than the current mispairing risk it would "fix". See the full TODO on
  // resolveDisplayContent before touching this.
  const isSource = sentences.some((sentence, index) =>
    resolveDisplayContent({
      language: questionLanguage,
      original: sentence,
      english: sentencesEnglish[index],
    }).isSource
  );

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
        setPendingExpertFeedback(feedbackPayload);
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
  // Used by the Good/Needs improvement choice living inside the source-text
  // popout (isSource case) instead of directly on the prompt - closes
  // the popout and defers to the same handleFeedback the direct buttons use,
  // so both paths persist/branch identically.
  const handleSourceViewFeedback = (isPositive) => {
    setShowSourceView(false);
    handleFeedback(isPositive);
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
    setPendingExpertFeedback(feedbackWithType);
    setFeedbackGiven(true);
  };

  // Once "Thank you" is showing for an expert eval, any click anywhere hands
  // the persisted feedback up to the parent (onExpertFeedbackChange), which
  // updates `messages` state - that flips ChatInterface.js's
  // `!message.interaction.expertFeedback` check, so this component stops
  // being rendered at all and ExpertFeedbackPanel's summary takes over.
  // The listener is attached via setTimeout(0), not synchronously in this
  // effect, so it doesn't also catch the very click (still bubbling to
  // document) that triggered feedbackGiven in the first place.
  useEffect(() => {
    if (!pendingExpertFeedback || !onExpertFeedbackChange) return;
    let listenerAttached = false;
    const handleClickAnywhere = () => onExpertFeedbackChange(pendingExpertFeedback);
    const attachTimer = setTimeout(() => {
      listenerAttached = true;
      document.addEventListener('click', handleClickAnywhere);
    }, 0);
    return () => {
      clearTimeout(attachTimer);
      if (listenerAttached) {
        document.removeEventListener('click', handleClickAnywhere);
      }
    };
  }, [pendingExpertFeedback, onExpertFeedbackChange]);

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
      <p className="thank-you" role="status" ref={thankYouRef} tabIndex={-1} lang={lang}>
        <span className="gcds-icon fa fa-solid fa-check-circle" aria-hidden="true"></span>
        {t("homepage.feedback.thankYou")}
      </p>
    );
  }
  if (feedbackError) {
    return (
      <p className="feedback-error" lang={lang}>
        <span
          className="gcds-icon fa fa-solid fa-exclamation-circle"
          style={{ color: "red" }}
        ></span>
        {t('homepage.feedback.error')}
      </p>
    );
  }
  if (showSourceView) {
    return (
      <SourceViewComponent
        onClose={() => setShowSourceView(false)}
        onFeedback={handleSourceViewFeedback}
        lang={lang}
        sentenceCount={sentenceCount}
        sentences={sentences}
        questionLanguage={questionLanguage}
        sentencesEnglish={sentencesEnglish}
        englishQuestion={englishQuestion}
        answerNumber={answerNumber}
        titleRef={sourceViewTitleRef}
        noButtonRef={noButtonRef}
      />
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
        questionLanguage={questionLanguage}
        sentencesEnglish={sentencesEnglish}
        answerNumber={answerNumber}
        citationUrl={citationUrl}
        department={department}
        titleRef={expertRatingTitleRef}
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
        titleRef={publicRatingTitleRef}
      />
    );
  }

  // Show public mode question: Was this helpful? Yes No
  if (!hasExpertRole) {
    return (
      <div className="feedback-container" lang={lang}>
        <span className="feedback-text" aria-hidden="true">
          {t("homepage.publicFeedback.question")}
        </span>
        <span className="feedback-buttons">
          <button
            ref={yesButtonRef}
            className="feedback-link button-as-link link-default hover:link-hover feedback-icon-up"
            onClick={() => handleFeedback(true)}
            tabIndex="0"
            aria-label={`${t("homepage.publicFeedback.question")} ${t("common.yes", "Yes")}`}
          >
            {t("common.yes", "Yes")}
          </button>
          <span className="feedback-separator">·</span>
          <button
            ref={noButtonRef}
            className="feedback-link button-as-link link-default hover:link-hover feedback-icon-down"
            onClick={() => handleFeedback(false)}
            tabIndex="0"
            aria-label={`${t("homepage.publicFeedback.question")} ${t("common.no", "No")}`}
          >
            {t("common.no", "No")}
          </button>
        </span>
        {showSkipButton && (
          <>
            <a
              className="wb-inv"
              href={`#${skipToId}`}
              onClick={onSkip}
              aria-label={skipButtonLabel}
            >
              {skipButtonLabel}
            </a>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="feedback-container" lang={lang}>
      <span className="feedback-text" aria-hidden="true">{t("homepage.feedback.question")} </span>
      {isSource ? (
        // Answer isn't already EN/FR - a reviewer can't meaningfully rate
        // what they can't read, so AI Answers' own English source text comes
        // first and Good/Needs improvement live inside that view instead of
        // here.
        <button
          ref={viewSourceButtonRef}
          className="feedback-link button-as-link font-size-text-sm-nr"
          onClick={() => setShowSourceView(true)}
          tabIndex="0"
          aria-label={withAnswerNumber(t("homepage.feedback.viewSource"))}
        >
          {t("homepage.feedback.viewSource")}
        </button>
      ) : (
        <>
          <button
            ref={usefulButtonRef}
            className="feedback-link button-as-link feedback-icon-up"
            onClick={() => handleFeedback(true)}
            tabIndex="0"
            aria-label={`${t("homepage.feedback.question")} ${t("homepage.feedback.useful")}`}
          >
            {t("homepage.feedback.useful")}
          </button>
          <span className="feedback-separator">·</span>
          <span className="feedback-text">{t("homepage.feedback.or")}</span>
          <span className="feedback-separator">·</span>
          <button
            ref={noButtonRef}
            className="feedback-link button-as-link feedback-icon-down"
            onClick={() => handleFeedback(false)}
            tabIndex="0"
            aria-label={`${t("homepage.feedback.question")} ${t("homepage.feedback.notUseful")}`}
          >
            {t("homepage.feedback.notUseful")}
          </button>
        </>
      )}

      {/* Add the skip link after the other buttons, in the same line */}
      {showSkipButton && (
        <>
          <span className="feedback-separator"></span>
          <a
            className="wb-inv"
            href={`#${skipToId}`}
            onClick={onSkip}
            aria-label={skipButtonLabel}
          >
            {skipButtonLabel}
          </a>
        </>
      )}
    </div>
  );
};

export default FeedbackComponent;
