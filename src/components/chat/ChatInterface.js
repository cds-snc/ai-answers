import React, { useEffect, useState, useRef } from 'react';
import { GcdsDetails } from '@cdssnc/gcds-components-react';
import FeedbackComponent from './FeedbackComponent.js';
import { useTranslations } from '../../hooks/useTranslations.js';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

const MAX_CHARS = 400;

const ChatInterface = ({
  messages,
  inputText,
  isLoading,
  textareaKey,
  handleInputChange,
  handleSendMessage,
  handleReload,
  handleAIToggle,
  handleDepartmentChange,
  handleReferringUrlChange,
  handleFeedback,
  formatAIResponse,
  selectedAI,
  selectedDepartment,
  referringUrl,
  turnCount,
  showFeedback,
  displayStatus,
  currentDepartment,
  currentTopic,
  MAX_CONVERSATION_TURNS,
  t,
  lang,
  parsedResponses,
  extractSentences,
}) => {
  const [charCount, setCharCount] = useState(0);
  const [userHasClickedTextarea, setUserHasClickedTextarea] = useState(false);
  const textareaRef = useRef(null);

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
            if (node.classList && node.classList.contains('citation-container')) {
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
    const textarea = document.querySelector('#message');
    const button = document.querySelector('.btn-primary-send');

    // Create loading hint
    const placeholderHint = document.createElement('div');
    placeholderHint.id = 'temp-hint';
    placeholderHint.innerHTML = `<p><FontAwesomeIcon icon="wand-magic-sparkles" />${t('homepage.chat.input.loadingHint')}</p>`;

    if (isLoading) {
      if (textarea) {
        textarea.style.display = 'none';
        textarea.parentNode.insertBefore(placeholderHint, textarea);
      }
      if (button) button.style.display = 'none';
    } else {
      if (textarea) textarea.style.display = 'block';
      const tempHint = document.getElementById('temp-hint');
      if (tempHint) tempHint.remove();
    }

    return () => {
      const tempHint = document.getElementById('temp-hint');
      if (tempHint) tempHint.remove();
    };
  }, [isLoading, t]);

  const getLabelForInput = () => {
    if (turnCount >= 1) {
      return t('homepage.chat.input.followUp');
    }
    return t('homepage.chat.input.initial');
  };

  const getLastMessageSentenceCount = () => {
    const lastAiMessage = messages.filter((m) => m.sender === 'ai').pop();
    if (lastAiMessage && parsedResponses[lastAiMessage.id]) {
      return parsedResponses[lastAiMessage.id].paragraphs.reduce(
        (count, paragraph) => count + extractSentences(paragraph).length,
        0
      );
    }
    return 1;
  };

  const handleTextareaInput = (event) => {
    const textarea = event.target;
    setCharCount(textarea.value.length);
    handleInputChange(event);

    // Auto-resize
    textarea.style.height = 'auto';
    textarea.style.height = `${textarea.scrollHeight}px`;
  };

  const handleKeyPress = (event) => {
    if (event.key === 'Enter') {
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
    const chatContainer = document.querySelector('.chat-container');
    if (!chatContainer.contains(document.activeElement)) {
      setUserHasClickedTextarea(false);
    }
  };

  return (
    <div className="chat-container" tabIndex="0">
      <div className="message-list">
        {messages.map((message) => (
          <div key={`message-${message.id}`} className={`message ${message.sender}`}>
            {message.sender === 'user' ? (
              <div
                className={`user-message-box ${
                  message.redactedText?.includes('XXX')
                    ? 'privacy-box'
                    : message.redactedText?.includes('###')
                      ? 'redacted-box'
                      : ''
                }`}
              >
                <p
                  className={
                    message.redactedText?.includes('XXX')
                      ? 'privacy-message'
                      : message.redactedText?.includes('###')
                        ? 'redacted-message'
                        : ''
                  }
                >
                  {message.redactedText}
                </p>
                {message.redactedItems?.length > 0 && message.redactedText && (
                  <p
                    className={
                      message.redactedText.includes('XXX')
                        ? 'privacy-preview'
                        : message.redactedText.includes('###')
                          ? 'redacted-preview'
                          : ''
                    }
                  >
                    {message.redactedText.includes('XXX') && (
                      <>
                        <FontAwesomeIcon icon="circle-info" />{' '}
                        {t('homepage.chat.messages.privacyMessage')}
                      </>
                    )}
                    {message.redactedText.includes('###') &&
                      t('homepage.chat.messages.blockedMessage')}
                  </p>
                )}
              </div>
            ) : (
              <>
                {message.error ? (
                  <div className="error-message">{message.text}</div>
                ) : (
                  formatAIResponse(message.text, message.aiService, message.id)
                )}
                {message.id === messages.length - 1 &&
                  showFeedback &&
                  !message.error &&
                  !message.text.includes('<clarifying-question>') && (
                    <FeedbackComponent
                      onFeedback={handleFeedback}
                      lang={lang}
                      sentenceCount={getLastMessageSentenceCount()}
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
                {displayStatus === 'thinkingWithContext'
                  ? `${t('homepage.chat.messages.thinkingWithContext')}: ${currentDepartment} - ${currentTopic}`
                  : t(`homepage.chat.messages.${displayStatus}`)}
              </div>
            </div>
            <div className="loading-hint-text">
              <FontAwesomeIcon icon="wand-magic-sparkles" />
              &nbsp;
              {t('homepage.chat.input.loadingHint')}
            </div>
          </>
        )}

        {turnCount >= MAX_CONVERSATION_TURNS && (
          <div key="limit-reached" className="message ai">
            <div className="limit-reached-message">
              <p>{t('homepage.chat.messages.limitReached', { count: MAX_CONVERSATION_TURNS })}</p>
              <button onClick={handleReload} className="btn-primary visible">
                {t('homepage.chat.buttons.reload')}
              </button>
            </div>
          </div>
        )}
      </div>

      {turnCount < MAX_CONVERSATION_TURNS && (
        <div className="input-area mt-200">
          {!isLoading && (
            <form className="mrgn-tp-xl mrgn-bttm-lg">
              <div className="field-container">
                <label htmlFor="message">{getLabelForInput()}</label>
                <span className="hint-text">
                  <FontAwesomeIcon icon="wand-magic-sparkles" />
                  &nbsp;
                  {t('homepage.chat.input.hint')}
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
                    required
                    disabled={isLoading}
                  />
                  <button
                    type="submit"
                    onClick={handleSendMessage}
                    className={`btn-primary-send ${inputText.trim().length > 0 && charCount <= MAX_CHARS ? 'visible' : ''}`}
                    disabled={isLoading || charCount > MAX_CHARS || inputText.trim().length === 0}
                  >
                    <span className="button-text">{t('homepage.chat.buttons.send')}</span>
                    <FontAwesomeIcon className="button-icon" icon="arrow-up" size="md" />
                  </button>
                </div>

                {charCount >= MAX_CHARS - 10 && (
                  <div className={charCount > MAX_CHARS ? 'character-limit' : 'character-warning'}>
                    <FontAwesomeIcon icon="circle-exclamation" />
                    &nbsp;
                    {charCount > MAX_CHARS
                      ? t('homepage.chat.messages.characterLimit')
                          .replace('{count}', Math.max(1, charCount - MAX_CHARS))
                          .replace(
                            '{unit}',
                            charCount - MAX_CHARS === 1
                              ? t('homepage.chat.messages.character')
                              : t('homepage.chat.messages.characters')
                          )
                      : t('homepage.chat.messages.characterWarning')
                          .replace('{count}', MAX_CHARS - charCount)
                          .replace(
                            '{unit}',
                            MAX_CHARS - charCount === 1
                              ? t('homepage.chat.messages.character')
                              : t('homepage.chat.messages.characters')
                          )}
                  </div>
                )}
              </div>
            </form>
          )}
          <GcdsDetails className="hr" detailsTitle={t('homepage.chat.options.title')}>
            <div className="ai-toggle">
              <fieldset className="ai-toggle_fieldset">
                <div className="ai-toggle_container">
                  <legend className="ai-toggle_legend">
                    {t('homepage.chat.options.aiSelection.label')}
                  </legend>
                  <div className="ai-toggle_option">
                    <input
                      type="radio"
                      id="claude"
                      name="ai-selection"
                      value="claude"
                      checked={selectedAI === 'claude'}
                      onChange={handleAIToggle}
                      className="ai-toggle_radio-input"
                    />
                    <label htmlFor="claude">{t('homepage.chat.options.aiSelection.claude')}</label>
                  </div>
                  <div className="ai-toggle_option">
                    <input
                      type="radio"
                      id="chatgpt"
                      name="ai-selection"
                      value="chatgpt"
                      checked={selectedAI === 'chatgpt'}
                      onChange={handleAIToggle}
                      className="ai-toggle_radio-input"
                    />
                    <label htmlFor="chatgpt">
                      {t('homepage.chat.options.aiSelection.chatgpt')}
                    </label>
                  </div>
                  <div className="ai-toggle_option">
                    <input
                      type="radio"
                      id="cohere"
                      name="ai-selection"
                      value="cohere"
                      checked={selectedAI === 'cohere'}
                      onChange={handleAIToggle}
                      className="ai-toggle_radio-input"
                    />
                    <label htmlFor="cohere">{t('homepage.chat.options.aiSelection.cohere')}</label>
                  </div>
                </div>
              </fieldset>
            </div>

            <div className="mrgn-bttm-10">
              <label htmlFor="referring-url">{t('homepage.chat.options.referringUrl.label')}</label>
              <input
                id="referring-url"
                type="url"
                value={referringUrl}
                onChange={handleReferringUrlChange}
                className="chat-border"
              />
            </div>
          </GcdsDetails>
        </div>
      )}
    </div>
  );
};

export default ChatInterface;
