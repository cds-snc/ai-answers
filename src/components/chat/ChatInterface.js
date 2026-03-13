import React, { useEffect, useState, useRef, useCallback } from "react";
import FeedbackComponent from "./FeedbackComponent.js";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import ChatOptions from "./ChatOptions.js";
import ExpertFeedbackPanel from "./review/ExpertFeedbackPanel.js";
import PublicFeedbackPanel from "./review/PublicFeedbackPanel.js";
import DownloadPanel from "./review/DownloadPanel.js";
import EvalPanel from "./review/EvalPanel.js";
import aiStarsGray from '../../assets/ai-stars-333-90.png';
import aiStarsBlue from '../../assets/ai-stars-0535d2-90.png';

const MAX_CHARS = 260; //updated from 400 down to 260 after first public trial -96% used 150 chars or less, longer questions were manipulative and unclear

const ChatInterface = ({
  messages,
  inputText,
  isLoading,
  textareaKey,
  handleInputChange,
  handleSendMessage,
  handleReload,
  handleAIToggle,
  handleSearchToggle,
  workflow,
  handleWorkflowChange,
  handleReferringUrlChange,
  formatAIResponse,
  selectedAI,
  selectedSearch,
  referringUrl,
  chatCreatedAt,
  turnCount,
  showFeedback,
  displayStatus,
  currentDepartment,
  currentTopic,
  MAX_CONVERSATION_TURNS,
  t,
  lang,
  extractSentences,
  chatId,
  readOnly = false,
}) => {
  // Add safeT helper function
  const safeT = useCallback(
    (key) => {
      const result = t(key);
      return typeof result === "object" && result !== null
        ? result.text
        : result;
    },
    [t]
  );

  // Add truncateURL helper function 
  const truncateURL = useCallback((url) => {
    if (!url) return '';
    try {
      const urlObj = new URL(url);
      const domain = urlObj.hostname.replace(/^www\./, '');
      const pathname = urlObj.pathname;
      const filename = pathname.split('/').pop() || '';

      return `${domain}/.../${filename}`;
    } catch (error) {
      console.error('Invalid URL:', error);
      return url;
    }
  }, []);

  // Add formatChatDate helper function
  const formatChatDate = useCallback((isoDateString) => {
    if (!isoDateString) return '';
    try {
      // Extract YYYY-MM-DD from ISO 8601 format
      return isoDateString.substring(0, 10);
    } catch (error) {
      console.error('Invalid date format:', error);
      return isoDateString;
    }
  }, []);

  const [isTextareaFocused, setIsTextareaFocused] = useState(false);
  const prevIsLoadingRef = useRef(false);
  const lastAIMessageRef = useRef(null);
  const lastErrorRef = useRef(null);
  const loadingContainerRef = useRef(null);


  const [charCount, setCharCount] = useState(0);
  const [charCountAlert, setCharCountAlert] = useState("");
  const textareaRef = useRef(null);
  const charCountAlertTimer = useRef(null);

  // Function to focus textarea when skip button is clicked
  const focusTextarea = () => {
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  };

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
      }
    }, 100);

    return () => clearTimeout(timeoutId);
  }, []);

  // Manage focus across the loading lifecycle so screen reader users are never
  // stranded on the browser chrome:
  //   loading starts → focus the loading container (textarea is disabled, focus drops otherwise)
  //   loading ends   → focus the new AI message to read response in document order
  useEffect(() => {
    if (!prevIsLoadingRef.current && isLoading) {
      if (loadingContainerRef.current) {
        loadingContainerRef.current.focus();
      }
    } else if (prevIsLoadingRef.current && !isLoading) {
      if (lastErrorRef.current) {
        lastErrorRef.current.focus();
      } else if (lastAIMessageRef.current) {
        lastAIMessageRef.current.focus();
      }
    }
    prevIsLoadingRef.current = isLoading;
  }, [isLoading]);

  useEffect(() => {
    const textarea = document.querySelector("#message");
    const button = document.querySelector(".btn-primary-send");

    // Create loading hint
    const placeholderHint = document.createElement("div");
    placeholderHint.id = "temp-hint";
    placeholderHint.innerHTML = `<p><img 
      src="${aiStarsBlue}" 
      class="ai-icon" 
      width="24" 
      height="24" 
      alt=""
      aria-hidden="true"
    />${safeT("homepage.chat.input.loadingHint")}</p>`;

    if (isLoading) {
      if (textarea) {
        textarea.style.display = "none";
        textarea.parentNode.insertBefore(placeholderHint, textarea);
      }
      if (button) button.style.display = "none";
    } else {
      if (textarea) textarea.style.display = "block";
      const tempHint = document.getElementById("temp-hint");
      if (tempHint) tempHint.remove();
    }

    return () => {
      const tempHint = document.getElementById("temp-hint");
      if (tempHint) tempHint.remove();
    };
  }, [isLoading, t, safeT]);

  // Scroll down button functionality
  // Button visible until footer is visible
  // Scrolls 80% of viewport on click
  useEffect(() => {
    const scrollBtn = document.querySelector('.scroll-down-btn');
    if (!scrollBtn) return;

    const checkScrollableContent = () => {
      // Show after first AI response OR error message (not loading)
      const hasAIResponse = messages.some(m => m.sender === 'ai' && !m.error);
      const hasErrorMessage = messages.some(m => m.error && (m.sender === 'system' || m.sender === 'ai'));

      if ((!hasAIResponse && !hasErrorMessage) || isLoading) {
        scrollBtn.classList.remove('has-scroll');
        return;
      }

      // Check if footer is visible - try input-area bottom first, then gcds-footer__sub top
      // const inputArea = document.querySelector('.input-area');
      const gcdsFooter = document.querySelector('.gcds-footer__sub');

      let isFooterVisible = false;

      // if (inputArea) {
      //   const inputRect = inputArea.getBoundingClientRect();
      //   // Check if bottom of input area is visible - wasn't working reliably so switched to gcds-footer__sub
      //   isFooterVisible = inputRect.bottom >= 0 && inputRect.bottom <= window.innerHeight;
      // }

      // If input area bottom not visible, check gcds-footer__sub top
      if (!isFooterVisible && gcdsFooter) {
        const footerRect = gcdsFooter.getBoundingClientRect();
        // Check if top of footer is visible
        isFooterVisible = footerRect.top >= 0 && footerRect.top <= window.innerHeight;
      }

      if (isFooterVisible) {
        scrollBtn.classList.remove('has-scroll');
        return;
      }

      // Show button if there's more content below
      const windowHeight = window.innerHeight;
      const documentHeight = document.documentElement.scrollHeight;
      const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
      const scrollBottom = scrollTop + windowHeight;

      if (scrollBottom < documentHeight - 50) {
        scrollBtn.classList.add('has-scroll');
      } else {
        scrollBtn.classList.remove('has-scroll');
      }
    };

    const scrollDown = (e) => {
      e.preventDefault();
      const currentScroll = window.pageYOffset || document.documentElement.scrollTop;
      const viewportHeight = window.innerHeight;
      const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      // Same behavior for all: scroll 80% of viewport
      const targetScroll = currentScroll + (viewportHeight * 0.8);
      const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
      const scrollTo = Math.min(targetScroll, maxScroll);

      window.scrollTo({
        top: scrollTo,
        behavior: prefersReducedMotion ? 'auto' : 'smooth'
      });
    };

    const handleKeyDown = (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        scrollDown(e);
      }
    };

    scrollBtn.addEventListener('click', scrollDown);
    scrollBtn.addEventListener('keydown', handleKeyDown);
    window.addEventListener('scroll', checkScrollableContent);
    window.addEventListener('resize', checkScrollableContent);

    checkScrollableContent();

    return () => {
      scrollBtn.removeEventListener('click', scrollDown);
      scrollBtn.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('scroll', checkScrollableContent);
      window.removeEventListener('resize', checkScrollableContent);
    };
  }, [messages, isLoading]);

  // Reset icon state when a new turn begins
  useEffect(() => {
    if (turnCount > 0) {
      setIsTextareaFocused(false);
    }
  }, [turnCount]);

  // Reset char count on submission
  useEffect(() => {
    if (isLoading) {
      setCharCount(0);
    }
  }, [isLoading]);

  const getLabelForInput = () => {
    if (turnCount >= 1) {
      const followUp = t("homepage.chat.input.followUp");
      return typeof followUp === "object" ? followUp.text : followUp;
    }
    const initial = t("homepage.chat.input.initial");
    return typeof initial === "object" ? initial.text : initial;
  };

  // TOOD is there a difference between paragraphs and sentrences?
  const getLastMessageSentenceCount = () => {
    const lastAiMessage = messages.filter((m) => m.sender === "ai").pop();
    if (
      lastAiMessage &&
      lastAiMessage.interaction &&
      lastAiMessage.interaction.answer
    ) {
      const answer = lastAiMessage.interaction.answer;
      if (
        answer.paragraphs &&
        Array.isArray(answer.paragraphs) &&
        answer.paragraphs.length > 0
      ) {
        return answer.paragraphs.reduce(
          (count, paragraph) => count + extractSentences(paragraph).length,
          0
        );
      } else if (answer.content) {
        return extractSentences(answer.content).length;
      }
    }
    return 1;
  };

  const handleTextareaInput = (event) => {
    const textarea = event.target;
    const newCount = textarea.value.length;
    setCharCount(newCount);
    handleInputChange(event);

    if (newCount > MAX_CHARS) {
      clearTimeout(charCountAlertTimer.current);
      charCountAlertTimer.current = setTimeout(() => {
        setCharCountAlert(
          safeT("homepage.chat.messages.characterLimit")
            .replace("{count}", Math.max(1, newCount - MAX_CHARS))
            .replace("{unit}", newCount - MAX_CHARS === 1
              ? safeT("homepage.chat.messages.character")
              : safeT("homepage.chat.messages.characters"))
        );
        setTimeout(() => setCharCountAlert(""), 1000);
      }, 500);
    } else {
      setCharCountAlert("");
    }

    // Auto-resize
    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
  };

  const handleKeyPress = (event) => {
    if (event.key === "Enter") {
      if (event.shiftKey) return;

      if (charCount > MAX_CHARS) {
          event.preventDefault();
          setCharCountAlert("");
          setTimeout(() => {
            setCharCountAlert(safeT("homepage.chat.buttons.sendDisabledTooLong"));
          }, 50);
          return;
        }

        if (inputText.trim().length === 0) {
          event.preventDefault();
          return;
        }

      event.preventDefault();
      handleSendMessage(event);
    }
  };

  const handleTextareaClick = () => {
    setIsTextareaFocused(true);
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  };

  const handleTextareaBlur = () => {
    setIsTextareaFocused(false);
  };

  const handleTextareaFocus = () => {
    setIsTextareaFocused(true);
  };

  return (
<div className="chat-container">
      {/* Show referring URL at the top for review mode */}
      {readOnly && referringUrl && (
        <span className="referring-url-chat">
          <b>{safeT("homepage.chat.input.referringURL")}</b>{" "}

          <a href={referringUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            {referringUrl}
          </a>
        </span>
      )}
      <section aria-labelledby="chat-section-heading">
        <h2 id="chat-section-heading" className="sr-only">
          {safeT("homepage.chat.section.heading")}
        </h2>
        <div className="message-list" role="log" aria-live="off">
        {(() => {
          const nonErrorAIMessages = messages.filter(m => m.sender === "ai" && !m.error);
          const answerLabelKeys = ['answerLabel1', 'answerLabel2', 'answerLabel3'];
          return messages.map((message) => {
          const isLastAIMessage =
            message.sender === "ai" &&
            !message.error &&
            message.id === nonErrorAIMessages[nonErrorAIMessages.length - 1]?.id;
          const aiAnswerIndex = (message.sender === "ai" && !message.error)
            ? nonErrorAIMessages.findIndex(m => m.id === message.id)
            : null;
          const isLastErrorMessage =
            message.error && message.id === messages[messages.length - 1]?.id;
          return (
          <div
            key={`message-${message.id}`}
            id={message.id ? `interactionId${message.id}` : undefined}
            className={`message ${message.sender}`}
            ref={isLastAIMessage ? lastAIMessageRef : null}
            tabIndex={isLastAIMessage ? -1 : undefined}
          >
            {message.sender === "ai" && !message.error && aiAnswerIndex !== null && (
              <h3 className="sr-only">
                {safeT(`homepage.chat.messages.${answerLabelKeys[aiAnswerIndex]}`)}
              </h3>
            )}
            {message.sender === "user" ? (
              <div
                className={`user-message-box ${message.redactedText?.includes("XXX")
                  ? "privacy-box"
                  : message.redactedText?.includes("###")
                    ? "redacted-box"
                    : ""
                  }`}
                {...(message.redactedText && {
                  "aria-describedby": `description-${message.id}`,
                })}
              >
                {/* Screen reader descriptions for navigation */}
                {message.redactedText?.includes("XXX") && (
                  <div id={`description-${message.id}`} className="sr-only">
                    {safeT("homepage.chat.messages.warning")}{" "}
                    {safeT("homepage.chat.messages.privacyMessage")}{" "}
                    {safeT("homepage.chat.messages.privateContent")}
                  </div>
                )}
                {message.redactedText?.includes("###") && (
                  <div id={`description-${message.id}`} className="sr-only">
                    {safeT("homepage.chat.messages.warning")}{" "}
                    {safeT("homepage.chat.messages.blockedMessage")}{" "}
                    {safeT("homepage.chat.messages.blockedContent")}
                  </div>
                )}

                <p
                  className={
                    message.redactedText?.includes("XXX")
                      ? "privacy-message"
                      : message.redactedText?.includes("###")
                        ? "redacted-message"
                        : ""
                  }
                  {...(message.redactedText?.includes("###") && {
                    "aria-hidden": "true",
                  })}
                >
                  {message.text}
                </p>
                {message.redactedText && (
                  <p
                    className={
                      message.redactedText?.includes("XXX")
                        ? "privacy-preview"
                        : message.redactedText?.includes("###")
                          ? "redacted-preview"
                          : ""
                    }
                    aria-hidden="true"
                  >
                    {message.redactedText?.includes("XXX") && (
                      <>
                        <FontAwesomeIcon icon="fa-circle-exclamation" />{" "}
                        {safeT("homepage.chat.messages.privacyMessage")}
                      </>
                    )}
                    {message.redactedText?.includes("###") &&
                      safeT("homepage.chat.messages.blockedMessage")}
                  </p>
                )}
              </div>
            ) : (
              <>
                {message.error ? (
                  message.isSessionTimeout ? (
                    <div
                      className="limit-reached-message"
                      ref={isLastErrorMessage ? lastErrorRef : null}
                      tabIndex={isLastErrorMessage ? -1 : undefined}
                    >
                      <h3 className="sr-only">
                        {safeT("homepage.chat.messages.sessionTimeoutHeading")}
                      </h3>
                      <p>{message.text}</p>
                      <button
                        onClick={handleReload}
                        className="btn-primary visible"
                        aria-label={safeT("homepage.chat.buttons.reloadSessionAriaLabel")}
                      >
                        {safeT("homepage.chat.buttons.reload")}
                      </button>
                    </div>
                  ) : message.isRedactionError ? (
                    <div
                      className={`error-message-box ${message.redactedText?.includes("XXX") ? "privacy-error-box" : "error-box"}`}
                      ref={isLastErrorMessage ? lastErrorRef : null}
                      tabIndex={isLastErrorMessage ? -1 : undefined}
                    >
                      <h3 className="sr-only">{safeT("homepage.chat.messages.warning")}</h3>
                      <p
                        className={message.redactedText?.includes("XXX") ? "privacy-message" : "redacted-message"}
                        {...(message.redactedText?.includes("###") && { "aria-hidden": "true" })}
                      >
                        {message.redactedText}
                      </p>
                      <p
                        className={message.redactedText?.includes("XXX") ? "privacy-preview" : "redacted-preview"}
                        aria-hidden="true"
                      >
                        {message.redactedText?.includes("XXX") && (
                          <><FontAwesomeIcon icon="fa-circle-exclamation" /> {safeT("homepage.chat.messages.privacyMessage")}</>
                        )}
                        {message.redactedText?.includes("###") && safeT("homepage.chat.messages.blockedMessage")}
                      </p>
                      <p className={message.redactedText?.includes("XXX") ? "privacy-error-message" : "error-message"}>
                        {message.text}
                      </p>
                    </div>
                  ) : (
                    <div
                      className="error-message-box error-box"
                      ref={isLastErrorMessage ? lastErrorRef : null}
                      tabIndex={isLastErrorMessage ? -1 : undefined}
                    >
                      <h3 className="sr-only">{safeT("homepage.chat.messages.errorHeading")}</h3>
                      <p className="error-message">
                        {message.text}
                        {message.searchUrl && (
                          <>
                            <br />
                            {safeT("homepage.chat.messages.shortQueryDetails")}
                            <br />
                            <a href={message.searchUrl}>
                              {safeT("homepage.chat.messages.shortQuerySearch")}
                            </a>
                          </>
                        )}
                      </p>
                    </div>
                  )
                ) : (
                  <>
                    {formatAIResponse(message.aiService, message)}

                    {chatId && (
                      <div className="chat-id">
                        <p className="font-size-text-xxs-nr">
                          {safeT("homepage.chat.chatId")}: {chatId}
                        </p>
                      </div>
                    )}
                  </>
                )}

                {/* Panels will be rendered immediately after the FeedbackComponent below so they appear under the "How was this answer?" area */}

                {/* Show feedback component in review mode for all answers/interactions that do not have expertFeedback */}
                {readOnly &&
                  message.sender === "ai" &&
                  !message.error &&
                  message.interaction &&
                  caches &&
                  message.interaction.answer.answerType !== "question" &&
                  !message.interaction.expertFeedback && (
                    <FeedbackComponent
                      lang={lang}
                      sentences={
                        extractSentences(message.interaction.answer.content) ||
                        []
                      }
                      sentenceCount={
                        extractSentences(message.interaction.answer.content)
                          .length
                      }
                      chatId={chatId}
                      userMessageId={message.id}
                      showSkipButton={false}
                      onSkip={focusTextarea}
                      skipButtonLabel={safeT(
                        "homepage.chat.textarea.ariaLabel.skipfo"
                      )}
                    />
                  )}

                {/* Render review panels just under the FeedbackComponent / "How was this answer?" (very close) */}
                {readOnly &&
                  message.sender === "ai" &&
                  !message.error &&
                  message.interaction && (
                    <>
                      {/* Show referring URL only for the first AI message with review panels */}
                      {readOnly && messages.findIndex(m => m.sender === "ai" && !m.error && m.interaction) === messages.findIndex(m => m.id === message.id) && (
                        <div
                          style={{
                            padding: "0.75rem",
                            marginTop: "0.5rem",
                            marginBottom: "0.5rem",
                            backgroundColor: "#f5f5f5",
                            borderLeft: "4px solid #26374a",
                            fontSize: "0.9rem"
                          }}
                        >
                          <strong>{t("homepage.chat.review.referringUrl")}</strong>{" "}
                          {referringUrl ? (
                            <a
                              href={referringUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ wordBreak: "break-all" }}
                            >
                              {referringUrl}
                            </a>
                          ) : (
                            <span style={{ fontStyle: "italic", color: "#666" }}>none</span>
                          )}
                        </div>
                      )}
                      <div
                        className="inline-review-panels"
                        style={{ marginTop: "0.25rem" }}
                      >
                        <ExpertFeedbackPanel
                          message={message}
                          extractSentences={extractSentences}
                          t={t}
                        />
                        <PublicFeedbackPanel
                          message={message}
                          extractSentences={extractSentences}
                          t={t}
                        />
                        <DownloadPanel message={message} t={t} />
                        <EvalPanel message={message} t={t} />
                      </div>
                    </>
                  )}

                {/* Only show feedback for the last message if not in review mode */}
                {!readOnly &&
                  message.id === messages[messages.length - 1].id &&
                  showFeedback &&
                  !message.error &&
                  message.interaction.answer.answerType !== "question" && (
                    <FeedbackComponent
                      lang={lang}
                      sentenceCount={getLastMessageSentenceCount()}
                      sentences={
                        message.interaction.answer.paragraphs
                          ? message.interaction.answer.paragraphs.flatMap(
                            (paragraph) => extractSentences(paragraph)
                          )
                          : []
                      }
                      chatId={chatId}
                      userMessageId={message.id}
                      showSkipButton={
                        !readOnly &&
                        turnCount < MAX_CONVERSATION_TURNS &&
                        !isLoading
                      }
                      onSkip={focusTextarea}
                      skipButtonLabel={safeT(
                        "homepage.chat.textarea.ariaLabel.skipfo"
                      )}
                    />
                  )}
              </>
            )}
          </div>
          );
        });
        })()}

        {isLoading && (
          <>
            <div
              key="loading"
              className="loading-container"
              ref={loadingContainerRef}
              tabIndex={-1}
              aria-label={safeT("homepage.chat.messages.moderatingQuestion")}
            >
              <div className="loading-animation"></div>
              <div className="loading-text">
                {displayStatus && (displayStatus === "thinkingWithContext"
                  ? `${safeT("homepage.chat.messages.thinkingWithContext")}: ${currentDepartment || ""
                  } - ${currentTopic || ""}`
                  : safeT(`homepage.chat.messages.${displayStatus}`))}
              </div>
            </div>
            <div className="loading-hint-text" id="loading-hint">
              <img
                src={aiStarsBlue}
                className="ai-icon"
                width="24"
                height="24"
                alt=""
                aria-hidden="true"
              />
              &nbsp;
              {safeT("homepage.chat.input.loadingHint")}
            </div>
          </>
        )}

        {!readOnly && turnCount >= MAX_CONVERSATION_TURNS && (
          <div key="limit-reached" className="message ai">
            <div className="limit-reached-message">
              <h3 className="sr-only">
                {safeT("homepage.chat.messages.limitReachedHeading")}
              </h3>
              <p>
                {safeT("homepage.chat.messages.limitReached", {
                  count: MAX_CONVERSATION_TURNS,
                })}
              </p>
              <button
                onClick={handleReload}
                className="btn-primary visible"
                aria-label={safeT("homepage.chat.buttons.reloadAriaLabel")}
              >
                {safeT("homepage.chat.buttons.reload")}
              </button>
            </div>
          </div>
        )}
      </div>

        {/* Accessible Scroll Down Button */}
      <button
        className="scroll-down-btn"
        aria-label={safeT('homepage.scroll.ariaLabel')}
        title={safeT('homepage.scroll.title')}
        type="button"
        tabIndex="-1"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="11" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <path d="M12 7 L12 15 M8 13 L12 17 L16 13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {!readOnly && turnCount < MAX_CONVERSATION_TURNS && (
        <div className="input-area mt-200">
          {!isLoading && (
            <form className="mrgn-tp-xl mrgn-bttm-lg" onSubmit={(e) => { e.preventDefault(); if (!isLoading && inputText.trim()) handleSendMessage(); }}>
              <div className="field-container">
                <label
                  htmlFor="message"
                  aria-label={
                    turnCount === 0
                      ? typeof t("homepage.chat.input.initial") === "object"
                        ? t("homepage.chat.input.initial").ariaLabel
                        : undefined
                      : typeof t("homepage.chat.input.followUp") === "object"
                        ? t("homepage.chat.input.followUp").ariaLabel
                        : undefined
                  }
                >
                  <span className="aria-hidden" aria-hidden="true">
                    {getLabelForInput()}
                  </span>
                </label>
                <span className="hint-text">
                  <img
                    src={isTextareaFocused ? aiStarsBlue : aiStarsGray}
                    className="ai-icon"
                    width="28"
                    height="28"
                    alt=""
                    aria-hidden="true"
                  />
                  &nbsp;
                  {safeT("homepage.chat.input.hint")}
                </span>
                {/* Show referring URL only on first turn */}
                {turnCount === 0 && referringUrl && (
                  <span className="referring-url-chat" id="displayReferringURL">
                    <b>{safeT("homepage.chat.input.referringPage")}</b> {truncateURL(referringUrl)}
                  </span>
                )}
                <div className="form-group">
                  <textarea
                    ref={textareaRef}
                    id="message"
                    name="message"
                    key={textareaKey}
                    value={inputText}
                    onChange={handleTextareaInput}
                    onKeyDown={handleKeyPress}
                    onClick={handleTextareaClick}
                    onBlur={handleTextareaBlur}
                    onFocus={handleTextareaFocus}
                    aria-label={
                      turnCount === 0
                        ? safeT("homepage.chat.textarea.ariaLabel.first")
                        : safeT("homepage.chat.textarea.ariaLabel.followon")
                    }
                    title={safeT("homepage.chat.textarea.title")}
                    required
                    disabled={isLoading}
                  />
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      handleSendMessage();
                    }}
                    className={`btn-primary-send ${inputText.trim().length > 0 && charCount <= MAX_CHARS
                      ? "visible"
                      : ""
                      }`}
                    disabled={
                      isLoading ||
                      charCount > MAX_CHARS ||
                      inputText.trim().length === 0
                    }
                   aria-label={
                      charCount > MAX_CHARS
                        ? safeT("homepage.chat.buttons.sendDisabledTooLong")
                        : safeT("homepage.chat.buttons.send")
                    }
                  >
                    <span className="button-text">
                      {safeT("homepage.chat.buttons.send")}
                    </span>
                    <FontAwesomeIcon
                      className="button-icon"
                      icon="arrow-up"
                      size="md"
                    />
                  </button>
                </div>

                {charCount >= MAX_CHARS - 10 && (
                  <div
                    className={
                      charCount > MAX_CHARS
                        ? "character-limit"
                        : "character-warning"
                    }
                  >
                    <FontAwesomeIcon icon="circle-exclamation" />
                    &nbsp;
                    {charCount > MAX_CHARS
                      ? safeT("homepage.chat.messages.characterLimit")
                        .replace(
                          "{count}",
                          Math.max(1, charCount - MAX_CHARS)
                        )
                        .replace(
                          "{unit}",
                          charCount - MAX_CHARS === 1
                            ? safeT("homepage.chat.messages.character")
                            : safeT("homepage.chat.messages.characters")
                        )
                      : safeT("homepage.chat.messages.characterWarning")
                        .replace("{count}", MAX_CHARS - charCount)
                        .replace(
                          "{unit}",
                          MAX_CHARS - charCount === 1
                            ? safeT("homepage.chat.messages.character")
                            : safeT("homepage.chat.messages.characters")
                        )}
                  </div>
                )}
              </div>
            </form>
          )}
          <ChatOptions
            safeT={safeT}
            selectedAI={selectedAI}
            handleAIToggle={handleAIToggle}
            selectedSearch={selectedSearch}
            handleSearchToggle={handleSearchToggle}
            workflow={workflow}
            handleWorkflowChange={handleWorkflowChange}
            referringUrl={referringUrl}
            handleReferringUrlChange={handleReferringUrlChange}
          />
        </div>
      )}
      </section>

      {/* Live region for character count alerts - mounts fresh each time to ensure re-announcement */}
        {charCountAlert && (
          <div role="alert" className="sr-only">
            {charCountAlert}
          </div>
        )}
      {/* Show chat date at bottom for review mode */}
      {readOnly && chatCreatedAt && (
        <div className="admin-date">
          <b>{safeT("homepage.chat.review.chatDate")}</b> {formatChatDate(chatCreatedAt)}
        </div>
      )}
    </div>

  );
};

export default ChatInterface;