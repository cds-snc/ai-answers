import React, { useEffect, useState, useRef, useCallback } from "react";
import FeedbackComponent from "./FeedbackComponent.js";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import ChatOptions from "./ChatOptions.js";
import ExpertFeedbackPanel from "./review/ExpertFeedbackPanel.js";
import PublicFeedbackPanel from "./review/PublicFeedbackPanel.js";
import EvalPanel from "./review/EvalPanel.js";

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

  const [redactionAlert, setRedactionAlert] = useState("");
  const [lastProcessedMessageId, setLastProcessedMessageId] = useState(null);

  // Effect to announce redaction warnings immediately
  useEffect(() => {
    if (messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      const secondLastMessage = messages[messages.length - 2];

      // Check for redaction warnings (system messages following redacted user messages)
      if (
        lastMessage.sender === "system" &&
        lastMessage.error &&
        secondLastMessage &&
        secondLastMessage.sender === "user" &&
        secondLastMessage.redactedText &&
        lastMessage.id !== lastProcessedMessageId
      ) {
        let warningMessage = "";

        if (secondLastMessage.redactedText.includes("XXX")) {
          warningMessage = `${safeT("homepage.chat.messages.warning")} ${safeT(
            "homepage.chat.messages.privacyMessage"
          )} ${safeT("homepage.chat.messages.privateContent")}`;
        } else if (secondLastMessage.redactedText.includes("###")) {
          warningMessage = `${safeT("homepage.chat.messages.warning")} ${safeT(
            "homepage.chat.messages.blockedMessage"
          )} ${safeT("homepage.chat.messages.blockedContent")}`;
        }

        if (warningMessage) {
          setLastProcessedMessageId(lastMessage.id);
          // Announce warning message followed by the original user message
          setTimeout(() => {
            setRedactionAlert(
              `${warningMessage} ${safeT(
                "homepage.chat.messages.yourQuestionWas"
              )} ${secondLastMessage.text}`
            );
            // Clear the alert after a moment
            setTimeout(() => setRedactionAlert(""), 2000);
          }, 500);
        }
      }
    }
  }, [messages, safeT, lastProcessedMessageId]);

  const [charCount, setCharCount] = useState(0);
  const [userHasClickedTextarea, setUserHasClickedTextarea] = useState(false);
  const textareaRef = useRef(null);

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

  useEffect(() => {
    const handleCitationAppearance = () => {
      if (textareaRef.current && !userHasClickedTextarea) {
        textareaRef.current.blur();
      }
    };

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.addedNodes.length) {
          for (const node of mutation.addedNodes) {
            if (
              node.classList &&
              node.classList.contains("citation-container")
            ) {
              handleCitationAppearance();
              break;
            }
          }
        }
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    return () => observer.disconnect();
  }, [userHasClickedTextarea]);

  useEffect(() => {
    const textarea = document.querySelector("#message");
    const button = document.querySelector(".btn-primary-send");

    // Create loading hint
    const placeholderHint = document.createElement("div");
    placeholderHint.id = "temp-hint";
    placeholderHint.innerHTML = `<p><FontAwesomeIcon icon="wand-magic-sparkles" />${safeT(
      "homepage.chat.input.loadingHint"
    )}</p>`;

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

      // Hide if follow-up input area is visible
      const inputArea = document.querySelector('.input-area');
      if (inputArea) {
        const inputRect = inputArea.getBoundingClientRect();
        const isInputVisible = inputRect.top < window.innerHeight && inputRect.bottom > 0;
        if (isInputVisible) {
          scrollBtn.classList.remove('has-scroll');
          return;
        }
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
      // Scroll 80% of viewport instead of 100%
      const targetScroll = currentScroll + (viewportHeight * 0.8);
      const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
      const scrollTo = Math.min(targetScroll, maxScroll);
      const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      
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
    setCharCount(textarea.value.length);
    handleInputChange(event);

    // Auto-resize
    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
  };

  const handleKeyPress = (event) => {
    if (event.key === "Enter") {
      if (event.shiftKey) return;

      if (inputText.trim().length === 0 || charCount > MAX_CHARS) {
        event.preventDefault();
        return;
      }

      event.preventDefault();
      handleSendMessage(event);
    }
  };

  const handleTextareaClick = () => {
    setUserHasClickedTextarea(true);
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  };

  const handleTextareaBlur = () => {
    const chatContainer = document.querySelector(".chat-container");
    if (!chatContainer.contains(document.activeElement)) {
      setUserHasClickedTextarea(false);
    }
  };

  return (
    <div className="chat-container">
      <div className="message-list">
        {messages.map((message) => (
          <div
              key={`message-${message.id}`}
              id={message.id ? `interactionId${message.id}` : undefined}
              className={`message ${message.sender}`}
            >
            {message.sender === "user" ? (
              <div
                className={`user-message-box ${
                  message.redactedText?.includes("XXX")
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
                  <div
                    className={`error-message-box ${
                      messages[
                        messages.findIndex((m) => m.id === message.id) - 1
                      ]?.redactedText?.includes("XXX")
                        ? "privacy-error-box"
                        : "error-box"
                    }`}
                  >
                    <p
                      className={
                        messages[
                          messages.findIndex((m) => m.id === message.id) - 1
                        ]?.redactedText?.includes("XXX")
                          ? "privacy-error-message"
                          : "error-message"
                      }
                    >
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
                ) : (
                  <>
                    {formatAIResponse(message.aiService, message)}

                    {chatId && (
                      <div className="chat-id">
                        <p>
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
        ))}

        {isLoading && (
          <>
            <div key="loading" className="loading-container">
              <div className="loading-animation"></div>
              <div className="loading-text">
                {displayStatus === "thinkingWithContext"
                  ? `${safeT("homepage.chat.messages.thinkingWithContext")}: ${
                      currentDepartment || ""
                    } - ${currentTopic || ""}`
                  : safeT(`homepage.chat.messages.${displayStatus}`)}
              </div>
            </div>
            <div className="loading-hint-text">
              <FontAwesomeIcon icon="wand-magic-sparkles" />
              &nbsp;
              {safeT("homepage.chat.input.loadingHint")}
            </div>
          </>
        )}

        {!readOnly && turnCount >= MAX_CONVERSATION_TURNS && (
          <div key="limit-reached" className="message ai">
            <div className="limit-reached-message">
              <p>
                {safeT("homepage.chat.messages.limitReached", {
                  count: MAX_CONVERSATION_TURNS,
                })}
              </p>
              <button onClick={handleReload} className="btn-primary visible">
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
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="11" fill="none" stroke="currentColor" strokeWidth="1.5"/>
          <path d="M12 7 L12 15 M8 13 L12 17 L16 13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {!readOnly && turnCount < MAX_CONVERSATION_TURNS && (
        <div className="input-area mt-200">
          {!isLoading && (
            <form className="mrgn-tp-xl mrgn-bttm-lg">
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
                  <FontAwesomeIcon icon="wand-magic-sparkles" />
                  &nbsp;
                  {safeT("homepage.chat.input.hint")}
                </span>
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
                    aria-label={
                      turnCount === 0
                        ? safeT("homepage.chat.textarea.ariaLabel.first")
                        : safeT("homepage.chat.textarea.ariaLabel.followon")
                    }
                    required
                    disabled={isLoading}
                  />
                  <button
                    type="submit"
                    onClick={handleSendMessage}
                    className={`btn-primary-send ${
                      inputText.trim().length > 0 && charCount <= MAX_CHARS
                        ? "visible"
                        : ""
                    }`}
                    disabled={
                      isLoading ||
                      charCount > MAX_CHARS ||
                      inputText.trim().length === 0
                    }
                    aria-label={
                      safeT("homepage.chat.buttons.send") || "Send message"
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

      {/* Live region for redaction warnings */}
      <div role="alert" className="sr-only">
        {redactionAlert}
      </div>
    </div>
  );
};

export default ChatInterface;