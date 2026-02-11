import React, { useState, useEffect, useCallback, useRef } from 'react';
import '../../styles/App.css';
import { useTranslations } from '../../hooks/useTranslations.js';
import { usePageContext, DEPARTMENT_MAPPINGS } from '../../hooks/usePageParam.js';
import ChatInterface from './ChatInterface.js';
import { ChatWorkflowService, RedactionError, ShortQueryValidation } from '../../services/ChatWorkflowService.js';


import DataStoreService from '../../services/DataStoreService.js';
import SessionService from '../../services/SessionService.js';
import AuthService from '../../services/AuthService.js';
// Utility functions go here, before the component
const decodeHTMLEntities = (text) => {
  const entities = {
    '&nbsp;': '\u00A0',  // Non-breaking space
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&apos;': "'",
  };

  let decoded = text;
  Object.entries(entities).forEach(([entity, char]) => {
    decoded = decoded.split(entity).join(char);
  });
  return decoded;
};

const extractSentences = (paragraph) => {
  const sentenceRegex = /<s-?\d+>(.*?)<\/s-?\d+>/g;
  const sentences = [];
  let match;
  while ((match = sentenceRegex.exec(paragraph)) !== null) {
    sentences.push(match[1].trim());
  }
  return sentences.length > 0 ? sentences : [paragraph];
};

const ChatAppContainer = ({ lang = 'en', chatId, readOnly = false, initialMessages = [], initialReferringUrl = null, clientReferrer = null, chatCreatedAt = null, targetInteractionId = null, onSessionError = null, onChatIdUpdate = null }) => {
  const MAX_CONVERSATION_TURNS = 3;
  const MAX_CHAR_LIMIT = 400;
  const { t } = useTranslations(lang);

  // Add safeT helper function
  const safeT = useCallback((key) => {
    const result = t(key);
    return typeof result === 'object' && result !== null ? result.text : result;
  }, [t]);

  const { url: pageUrl, department: urlDepartment } = usePageContext();
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [textareaKey, setTextareaKey] = useState(0);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 480);
  const [showFeedback, setShowFeedback] = useState(false);
  // Persisted options (except referringUrl) saved in localStorage so they survive refresh/new chats
  const storageKey = (k) => `aiAnswers.${k}`;
  // selectedAI: prefer localStorage override; if absent, we'll load the persisted provider
  const [selectedAI, setSelectedAI] = useState(() => {
    try {
      const val = localStorage.getItem(storageKey('selectedAI'));
      return val !== null ? val : null;
    } catch (e) {
      return null;
    }
  }); // comment to cause change
  const [selectedSearch, setSelectedSearch] = useState(() => {
    try {
      return localStorage.getItem(storageKey('selectedSearch')) || 'google';
    } catch (e) {
      return 'google';
    }
  });
  // workflow: prefer a user-set value in localStorage; if none exists, leave null
  // so we can fetch the public default setting and avoid persisting it unless
  // the user explicitly chooses a workflow in the UI.
  const [workflow, setWorkflow] = useState(() => {
    try {
      const val = localStorage.getItem(storageKey('workflow'));
      return val !== null ? val : null;
    } catch (e) {
      return null;
    }
  });
  // Track whether an initial value existed in localStorage and whether the user
  // explicitly set the workflow during this session. We only persist when one
  // of these is true so we don't overwrite the user's future changes to the
  // public default unintentionally.
  const initialWorkflowFromLocalStorage = useRef(false);
  const userSetWorkflow = useRef(false);
  // Precedence for initial referring URL:
  // 1) saved review value (initialReferringUrl)
  // 2) pageUrl (from usePageContext)
  // 3) clientReferrer (document.referrer passed from HomePage)
  const [referringUrl, setReferringUrl] = useState(() => {
    return initialReferringUrl || pageUrl || clientReferrer || '';
  });
  const [selectedDepartment, setSelectedDepartment] = useState(urlDepartment || '');
  const [turnCount, setTurnCount] = useState(0);
  const messageIdCounter = useRef(0);
  const [displayStatus, setDisplayStatus] = useState('moderatingQuestion');
  const statusTimeoutRef = useRef(null);
  const statusQueueRef = useRef([]);
  // Add a ref to track if we're currently typing
  const isTyping = useRef(false);
  const [ariaLiveMessage, setAriaLiveMessage] = useState('');
  // Add this new state to prevent multiple loading announcements
  const [loadingAnnounced, setLoadingAnnounced] = useState(false);

  useEffect(() => {
    if (initialMessages && initialMessages.length > 0) {
      setMessages(initialMessages);
      const userTurns = initialMessages.filter(m => m.sender === 'user').length;
      setTurnCount(userTurns);
      setShowFeedback(true);
    }
    // If a targetInteractionId was provided, attempt to scroll to it after initial messages render
    if (targetInteractionId) {
      setTimeout(() => {
        try {
          // Try exact id first
          let el = document.getElementById(targetInteractionId);
          // If not found and the provided id doesn't already include the prefix, try prefixed version
          if (!el && !String(targetInteractionId).startsWith('interactionId')) {
            el = document.getElementById(`interactionId${targetInteractionId}`);
          }
          if (el && typeof el.scrollIntoView === 'function') {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            // also focus for accessibility
            try { if (typeof el.focus === 'function') el.focus(); } catch (e) { /* ignore */ }
          }
        } catch (e) {
          // ignore scroll errors
        }
      }, 200);
    }
  }, [initialMessages, targetInteractionId]);
  // This effect sets up a resize listener to update isMobile state for citation icon and link styling
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 480);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  // This effect monitors displayStatus changes to update screen reader announcements
  useEffect(() => {
    if (isLoading) {
      // Update aria-live message whenever displayStatus changes to key statuses
      if (displayStatus === 'moderatingQuestion') {
        setAriaLiveMessage(safeT('homepage.chat.messages.moderatingQuestion'));
        setLoadingAnnounced(true);
      } else if (displayStatus === 'generatingAnswer') {
        setAriaLiveMessage(safeT('homepage.chat.messages.generatingAnswer'));
        setLoadingAnnounced(true);
      }
    } else {
      // Reset the flag when loading completes
      setLoadingAnnounced(false);

      const lastMessage = messages[messages.length - 1];

      if (lastMessage) {
        if (lastMessage.sender === 'ai' && !lastMessage.error) {
          // AI response
          const paragraphs = lastMessage.interaction?.answer?.paragraphs || [];
          const sentences = paragraphs.flatMap(paragraph => extractSentences(paragraph));
          const plainText = sentences.join(' ');
          const citation = lastMessage.interaction?.answer?.citationHead || '';
          const displayUrl = lastMessage.interaction?.citationUrl || '';
          setAriaLiveMessage(`${safeT('homepage.chat.messages.yourAnswerIs')} ${plainText} ${citation} ${displayUrl}`.trim());
        } else if (lastMessage.sender === 'user' && lastMessage.redactedText) {
          // Redacted user message - announce the redacted text first
          setAriaLiveMessage(lastMessage.text || '');
          // Don't set a timeout here - let ChatInterface handle the warning announcement
        } else if (lastMessage.sender === 'user' && !lastMessage.redactedText && !lastMessage.error) {
          // Regular user message
          setAriaLiveMessage(lastMessage.text || '');
        } else if (lastMessage.error && lastMessage.sender === 'system') {
          // System error messages (including character limit, general errors, etc.)
          if (lastMessage.text) {
            // Handle React elements by extracting text content
            if (React.isValidElement(lastMessage.text)) {
              // For system messages with dangerouslySetInnerHTML, we need the actual text
              // This is a fallback - ideally the error message should be stored as plain text
              const tempDiv = document.createElement('div');
              tempDiv.innerHTML = lastMessage.text.props.dangerouslySetInnerHTML.__html;
              setAriaLiveMessage(tempDiv.textContent || tempDiv.innerText || '');
            } else {
              setAriaLiveMessage(lastMessage.text);
            }
          }
        }
      }
    }
  }, [isLoading, displayStatus, messages, t, selectedDepartment, safeT, loadingAnnounced]);

  const currentRequestId = useRef(null);

  const processNextStatus = useCallback(() => {
    if (statusQueueRef.current.length === 0) {
      statusTimeoutRef.current = null;
      return;
    }

    const nextStatusObj = statusQueueRef.current.shift();

    // Only display status if it belongs to the current active request
    if (nextStatusObj.requestId === currentRequestId.current) {
      setDisplayStatus(nextStatusObj.status);
    }

    statusTimeoutRef.current = setTimeout(() => {
      processNextStatus();
    }, 1500);
  }, []);

  const updateStatusWithTimer = useCallback((status) => {
    // Add the new status to the queue with the current request ID
    statusQueueRef.current.push({
      status,
      requestId: currentRequestId.current
    });

    // If there's no active timeout, start processing the queue
    if (!statusTimeoutRef.current) {
      processNextStatus();
    }
  }, [processNextStatus]);

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (statusTimeoutRef.current) {
        clearTimeout(statusTimeoutRef.current);
      }
    };
  }, []);

  const handleInputChange = (e) => {
    isTyping.current = true;
    setInputText(e.target.value);
    // Reset typing state after a short delay
    setTimeout(() => {
      isTyping.current = false;
    }, 100);
  };

  const handleAIToggle = (e) => {
    setSelectedAI(e.target.value);
    console.log('AI toggled to:', e.target.value); // Add this line for debugging
  };

  const handleSearchToggle = (e) => {
    setSelectedSearch(e.target.value);
    console.log('Search toggled to:', e.target.value);
  };

  // Persist selection changes to localStorage
  useEffect(() => {
    try {
      // Only persist when we have a concrete value (avoid storing null)
      if (selectedAI !== null && selectedAI !== undefined) {
        localStorage.setItem(storageKey('selectedAI'), selectedAI);
      }
    } catch (e) {
      // ignore storage errors
    }
  }, [selectedAI]);

  // If there's no localStorage value for selectedAI, load provider from DataStoreService
  useEffect(() => {
    let mounted = true;
    const loadProvider = async () => {
      if (selectedAI === null) {
        try {
          // Use the public setting endpoint so unauthenticated clients can read the provider
          const provider = await DataStoreService.getPublicSetting('provider', 'azure');
          if (mounted && provider) {
            setSelectedAI(provider);
            try {
              localStorage.setItem(storageKey('selectedAI'), provider);
            } catch (e) {
              // ignore storage errors
            }
          }
        } catch (err) {
          // fallback to openai if datastore call fails
          if (mounted) setSelectedAI('azure');
        }
      }
    };
    loadProvider();
    return () => { mounted = false; };
  }, [selectedAI]);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey('selectedSearch'), selectedSearch);
    } catch (e) {
      // ignore storage errors
    }
  }, [selectedSearch]);

  // Record whether a workflow value existed in localStorage at mount. This
  // helps us decide whether to persist later changes.
  useEffect(() => {
    try {
      const val = localStorage.getItem(storageKey('workflow'));
      if (val !== null) initialWorkflowFromLocalStorage.current = true;
    } catch (e) {
      // ignore
    }
  }, []);



  useEffect(() => {
    try {
      // Only persist workflow when it came from localStorage initially or the
      // user explicitly changed it during this session.
      if (workflow !== null && (initialWorkflowFromLocalStorage.current || userSetWorkflow.current)) {
        localStorage.setItem(storageKey('workflow'), workflow);
      }
    } catch (e) {
      // ignore storage errors
    }
  }, [workflow]);

  const handleWorkflowChange = (e) => {
    userSetWorkflow.current = true;
    setWorkflow(e.target.value);
    console.log('Workflow changed to:', e.target.value);
  };

  const clearInput = useCallback(() => {
    setInputText('');
    setTextareaKey(prevKey => prevKey + 1);
  }, []);

  const handleReferringUrlChange = (e) => {
    const url = e.target.value.trim();
    console.log('Referring URL changed:', url);
    setReferringUrl(url);

    // Parse department from manually entered URL
    try {
      const urlObj = new URL(url);
      const pathSegments = urlObj.pathname.split('/').filter(Boolean);

      // Find matching department
      let newDepartment = '';
      for (const segment of pathSegments) {
        for (const [, value] of Object.entries(DEPARTMENT_MAPPINGS)) {
          if (segment === value.en || segment === value.fr) {
            newDepartment = value.code;
            break;
          }
        }
        if (newDepartment) break;
      }

      // Update department if found, otherwise keep existing
      if (newDepartment) {
        setSelectedDepartment(newDepartment);
      }
    } catch (error) {
      // If URL is invalid or incomplete, don't change the department
      console.log('Invalid URL format:', error);
    }
  };

  const handleReload = () => {
    window.location.reload();
  };

  const handleSendMessage = useCallback(async () => {
    if (inputText.trim() !== '' && !isLoading) {
      setIsLoading(true);

      // Clear any pending status updates from previous requests
      if (statusTimeoutRef.current) {
        clearTimeout(statusTimeoutRef.current);
        statusTimeoutRef.current = null;
      }
      statusQueueRef.current = [];

      // Initial validation checks
      if (inputText.length > MAX_CHAR_LIMIT) {
        const errorMessageId = messageIdCounter.current++;
        setMessages(prevMessages => [
          ...prevMessages,
          {
            id: errorMessageId,
            text: safeT('homepage.chat.messages.characterLimit'),
            sender: 'system',
            error: true
          }
        ]);
        setIsLoading(false);
        return;
      }
      const userMessageId = messageIdCounter.current++;
      currentRequestId.current = userMessageId;
      const userMessage = inputText.trim();
      setMessages(prevMessages => [
        ...prevMessages,
        {
          id: userMessageId,
          text: userMessage,
          sender: 'user',
          ...(referringUrl.trim() && { referringUrl: referringUrl.trim() })
        }
      ]);
      let startMs;
      const overrideUserId = AuthService.getUserId ? AuthService.getUserId() : (AuthService.currentUser?.userId ?? null);
      try {
        const aiMessageId = messageIdCounter.current++;
        startMs = Date.now();
        const interaction = await ChatWorkflowService.processResponse(
          chatId,
          userMessage,
          aiMessageId,
          messages,
          lang,
          selectedDepartment,
          referringUrl,
          selectedAI,
          t,
          workflow,
          updateStatusWithTimer,  // Pass our new status handler
          selectedSearch,  // Add this parameter
          overrideUserId
        );
        const latencyMs = Date.now() - startMs;

        // Capture server-generated chatId (if this was the first request)
        if (interaction?.chatId && onChatIdUpdate) {
          onChatIdUpdate(interaction.chatId);
        }

        // Fire-and-forget report to server about latency (and success)
        // Use the interaction's chatId if we didn't have one before
        const effectiveChatId = interaction?.chatId || chatId;
        // fire-and-forget session report (no specific errorType for success)
        if (!overrideUserId) {
          SessionService.report(effectiveChatId, latencyMs, false, null);
        }

        clearInput();

        // Add the AI response to messages
        setMessages(prevMessages => [...prevMessages, {
          id: aiMessageId,
          interaction: interaction,
          sender: 'ai',
          aiService: selectedAI,
        }]);

        setTurnCount(prev => prev + 1);

        setShowFeedback(true);
        setIsLoading(false);

      } catch (error) {
        // attempt to record latency and error, including an errorType when we can
        try {
          const errLatency = Date.now() - (typeof startMs !== 'undefined' ? startMs : Date.now());
          let errorType = null;
          if (error instanceof RedactionError) {
            errorType = 'redaction';
          } else if (error instanceof ShortQueryValidation) {
            errorType = 'shortQuery';
          }
          (async () => {
            try {
              if (!overrideUserId) {
                await SessionService.report(chatId, errLatency, true, errorType);
              }
            } catch (e) {
              if (console && console.error) console.error('session report failed', e);
            }
          })();
        } catch (e) {
          // ignore
        }
        if (error instanceof RedactionError) {
          const userMessageId = messageIdCounter.current++;
          const blockedMessageId = messageIdCounter.current++;
          setMessages(prevMessages => [
            ...prevMessages.slice(0, -1),
            {
              id: userMessageId,
              text: error.redactedText,
              redactedText: error.redactedText,
              redactedItems: error.redactedItems,
              sender: 'user',
              error: true
            },
            {
              id: blockedMessageId,
              text: error.redactedText.includes('XXX')
                ? safeT('homepage.chat.messages.privateContent')
                : safeT('homepage.chat.messages.blockedContent'),
              sender: 'system',
              error: true
            }
          ]);
          clearInput();
          setIsLoading(false);
          return;
        } else if (error instanceof ShortQueryValidation) {
          // Just append the short query error message, do not remove any messages
          const shortQueryMessageId = messageIdCounter.current++;
          setMessages(prevMessages => [
            ...prevMessages,
            {
              id: shortQueryMessageId,
              text: safeT('homepage.chat.messages.shortQueryMessage'),
              searchUrl: error.searchUrl,
              sender: 'system',
              error: true
            }
          ]);
          setIsLoading(false);
          return;
        } else {
          console.error('Error in handleSendMessage:', error);

          // Handle session availability errors (503)
          if (error.message?.includes('status=503')) {
            if (typeof onSessionError === 'function') {
              onSessionError(error);
              setIsLoading(false);
              return;
            }
          }

          // Handle session timeout / invalid chatId (403)
          if (error.message?.includes('status=403') && (error.message?.includes('invalid_chatId') || error.message?.includes('no_session'))) {
            const timeoutMessageId = messageIdCounter.current++;
            setMessages(prevMessages => [
              ...prevMessages,
              {
                id: timeoutMessageId,
                text: safeT('homepage.chat.messages.sessionTimedOut'),
                sender: 'ai',
                error: true,
                isSessionTimeout: true
              }
            ]);
            setIsLoading(false);
            return;
          }

          const errorMessageId = messageIdCounter.current++;
          setMessages(prevMessages => [
            ...prevMessages,
            {
              id: errorMessageId,
              text: safeT('homepage.chat.messages.error'),
              sender: 'system',
              error: true
            }
          ]);
          clearInput();
          setIsLoading(false);
        }
      }

    }
  }, [
    chatId,
    inputText,
    referringUrl,
    selectedAI,
    selectedSearch,  // Add this dependency
    workflow,
    lang,
    t,
    clearInput,
    selectedDepartment,
    isLoading,
    messages,
    updateStatusWithTimer,
    safeT
  ]);

  // If a pageUrl becomes available later and there was no saved review value,
  // prefer pageUrl over a clientReferrer. Do not override an explicit saved
  // initialReferringUrl.
  useEffect(() => {
    // If pageUrl becomes available later and there was no saved review value,
    // prefer pageUrl over a clientReferrer — but don't override an explicit
    // initialReferringUrl or a user-edited referringUrl.
    if (pageUrl && !initialReferringUrl && (!referringUrl || referringUrl === '')) {
      setReferringUrl(pageUrl);
    }
    if (urlDepartment && !selectedDepartment) {
      setSelectedDepartment(urlDepartment);
    }
  }, [pageUrl, urlDepartment, initialReferringUrl, selectedDepartment, referringUrl]);

  const formatAIResponse = useCallback((aiService, message) => {
    const messageId = message.id;
    // Prefer paragraphs, fallback to sentences, fallback to empty array
    let contentArr = [];
    if (message.interaction && message.interaction.answer) {
      if (Array.isArray(message.interaction.answer.paragraphs) && message.interaction.answer.paragraphs.length > 0) {
        contentArr = message.interaction.answer.paragraphs.map(paragraph =>
          paragraph.replace(/<translated-question>.*?<\/translated-question>/g, '')
        );
      } else if (Array.isArray(message.interaction.answer.sentences) && message.interaction.answer.sentences.length > 0) {
        contentArr = message.interaction.answer.sentences;
      }
    }
    // Updated citation logic
    const answer = message.interaction?.answer || {};
    const citation = answer.citation || {};
    const citationHead = answer.citationHead || citation.citationHead || '';
    // displayUrl is the citation URL to show and use for analytics
    const displayUrl = message.interaction?.citationUrl || answer.providedCitationUrl || citation.providedCitationUrl || '';
    // interactionId is the message id (client-side userMessageId)
    const interactionId = messageId || message.interaction?.interactionId || message.interaction?.userMessageId || '';
    return (
      <div className="ai-message-content">
        {contentArr.map((content, index) => {
          // If using paragraphs, split into sentences; if using sentences, just display
          const sentences = (answer.paragraphs && Array.isArray(answer.paragraphs))
            ? extractSentences(content)
            : [content];
          return sentences.map((sentence, sentenceIndex) => (
            <p key={`${messageId}-p${index}-s${sentenceIndex}`} className="ai-sentence">
              {decodeHTMLEntities(sentence)}
            </p>
          ));
        })}
        {answer.answerType === 'normal' && (citationHead || displayUrl) && (
          <>
            <hr className="citation-divider" />
            <div className="citation-container">
              {citationHead && <p key={`${messageId}-head`} className="citation-head font-size-text-small">{citationHead}</p>}
              {displayUrl && (
                <ul key={`${messageId}-link`} className="citation-link list-disc">
                  <li>
                    <a
                      href={displayUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      tabIndex="0"
                      className={isMobile && displayUrl.length > 40 ? 'long-url-mobile' : ''}
                      onClick={() => {
                        try {
                          if (window && window.adobeDataLayer) {
                            // Build customCall using the required structure:
                            // Dept. Abbreviation:Custom Variable Name:Custom Value
                            // Use department abbreviation ESDC-EDSC and describe this as a Citation Click.
                            var customCallValue = `ESDC-EDSC:Citation Click:${displayUrl}`;
                            console.log('Pushing customTracking to Adobe Data Layer (customCall):', customCallValue);
                            var result = window.adobeDataLayer.push({
                              event: 'customTracking',
                              link: {
                                customCall: customCallValue + '|' + chatId + '|' + interactionId
                              },
                            });
                            console.log('Adobe Data Layer push result:', result);
                          }
                        } catch (e) {
                          // swallow analytics errors — should not block navigation
                          console.error('Error pushing to Adobe Data Layer:', e);
                        }
                      }}
                    >
                      <span className="citation-url-text font-size-text-xsm-nr">
                        {(() => {
                          // Mobile: always render full URL, CSS handles ellipsis
                          if (isMobile) {
                            return (
                              <>
                                {displayUrl}
                                <span className="sr-only"> ({safeT('homepage.chat.input.opensInNewTab')})</span>
                                <svg
                                  width="12"
                                  height="12"
                                  viewBox="0 0 22 22"
                                  aria-hidden="true"
                                  className="new-tab-link-icon"
                                >
                                  <path
                                    d="M20 2L2 20M20 2H8M20 2V14"
                                    stroke="currentColor"
                                    strokeWidth="3.5"
                                    strokeLinecap="square"
                                    strokeLinejoin="square"
                                    fill="none"
                                  />
                                </svg>
                              </>
                            );
                          }

                          // Desktop: only use wrapping if URL is long enough
                          const needsWrapping = displayUrl.length > 80;

                          if (!needsWrapping) {
                            // Short URL: render normally
                            return (
                              <>
                                {displayUrl}
                                <span className="sr-only"> ({safeT('homepage.chat.input.opensInNewTab')})</span>
                                <svg
                                  width="12"
                                  height="12"
                                  viewBox="0 0 22 22"
                                  aria-hidden="true"
                                  className="new-tab-link-icon"
                                >
                                  <path
                                    d="M20 2L2 20M20 2H8M20 2V14"
                                    stroke="currentColor"
                                    strokeWidth="3.5"
                                    strokeLinecap="square"
                                    strokeLinejoin="square"
                                    fill="none"
                                  />
                                </svg>
                              </>
                            );
                          }

                          // Helper function for rendering wrapped URLs
                          const renderWithWrap = (beforeWrap, insideWrap) => (
                            <>
                              {beforeWrap.replace(/-/g, '\u2011')}
                              <span style={{ whiteSpace: 'nowrap' }}>
                                {insideWrap}
                                <span className="sr-only"> ({safeT('homepage.chat.input.opensInNewTab')})</span>
                                <svg
                                  width="12"
                                  height="12"
                                  viewBox="0 0 22 22"
                                  aria-hidden="true"
                                  className="new-tab-link-icon"
                                >
                                  <path
                                    d="M20 2L2 20M20 2H8M20 2V14"
                                    stroke="currentColor"
                                    strokeWidth="3.5"
                                    strokeLinecap="square"
                                    strokeLinejoin="square"
                                    fill="none"
                                  />
                                </svg>
                              </span>
                            </>
                          );

                          // Long URL on desktop: intelligently wrap last portion
                          const lastSlashIndex = displayUrl.lastIndexOf('/');

                          if (lastSlashIndex === -1) {
                            // No slash - wrap last 25 chars
                            const wrapLength = 25;
                            return renderWithWrap(
                              displayUrl.substring(0, displayUrl.length - wrapLength),
                              displayUrl.substring(displayUrl.length - wrapLength)
                            );
                          }

                          const lastSegment = displayUrl.substring(lastSlashIndex + 1);

                          // If last segment is too long (>40 chars), find a natural break point
                          if (lastSegment.length > 40) {
                            let breakPoint = null;

                            // Check for query string first
                            const queryIndex = lastSegment.indexOf('?');
                            if (queryIndex !== -1 && queryIndex < lastSegment.length - 15) {
                              breakPoint = lastSlashIndex + 1 + queryIndex;
                            } else {
                              // Look for last hyphen in a reasonable range
                              const searchStart = Math.max(0, lastSegment.length - 35);
                              const searchEnd = lastSegment.length - 15;
                              const substringToSearch = lastSegment.substring(searchStart, searchEnd);
                              const lastHyphen = substringToSearch.lastIndexOf('-');

                              if (lastHyphen !== -1) {
                                breakPoint = lastSlashIndex + 1 + searchStart + lastHyphen + 1;
                              }
                            }

                            // Use break point or fallback to wrapping last 25 chars
                            if (breakPoint !== null) {
                              return renderWithWrap(
                                displayUrl.substring(0, breakPoint),
                                displayUrl.substring(breakPoint)
                              );
                            } else {
                              const wrapLength = 25;
                              return renderWithWrap(
                                displayUrl.substring(0, displayUrl.length - wrapLength),
                                displayUrl.substring(displayUrl.length - wrapLength)
                              );
                            }
                          }

                          // Last segment is short enough (<40 chars), wrap it all
                          return renderWithWrap(
                            displayUrl.substring(0, lastSlashIndex + 1),
                            lastSegment
                          );
                        })()}
                      </span>
                    </a>
                  </li>
                </ul>
              )}
            </div>
          </>
        )}
        <div className="disclaimer">
          <p className="font-size-text-xsm-nr">
            {safeT('homepage.chat.input.disclaimer')}
          </p>
        </div>
      </div>
    );
  }, [safeT, chatId, isMobile]);

  // Add handler for department changes

  const initialInput = t('homepage.chat.input.initial');

  return (
    <>
      <ChatInterface
        messages={messages}
        inputText={inputText}
        isLoading={isLoading}
        textareaKey={textareaKey}
        handleInputChange={handleInputChange}
        handleSendMessage={handleSendMessage}
        handleReload={handleReload}
        handleAIToggle={handleAIToggle}
        handleSearchToggle={handleSearchToggle}
        workflow={workflow}
        handleWorkflowChange={handleWorkflowChange}
        handleReferringUrlChange={handleReferringUrlChange}
        formatAIResponse={formatAIResponse}
        selectedAI={selectedAI}
        selectedSearch={selectedSearch}
        referringUrl={referringUrl}
        chatCreatedAt={chatCreatedAt}
        turnCount={turnCount}
        showFeedback={showFeedback}
        displayStatus={displayStatus}
        MAX_CONVERSATION_TURNS={MAX_CONVERSATION_TURNS}
        t={t}
        lang={lang}
        privacyMessage={safeT('homepage.chat.messages.privacy')}
        getLabelForInput={() =>
          turnCount === 0
            ? (typeof initialInput === 'object' ? initialInput.text : initialInput)
            : (typeof t('homepage.chat.input.followUp') === 'object'
              ? t('homepage.chat.input.followUp').text
              : t('homepage.chat.input.followUp'))
        }
        ariaLabelForInput={
          turnCount === 0
            ? (typeof initialInput === 'object' ? initialInput.ariaLabel : undefined)
            : (typeof t('homepage.chat.input.followUp') === 'object'
              ? t('homepage.chat.input.followUp').ariaLabel
              : undefined)
        }
        extractSentences={extractSentences}
        chatId={chatId}
        readOnly={readOnly}
      />
      {/* Panels are rendered inline after each AI message in ChatInterface when in readOnly mode. */}
      <div
        aria-live="polite"
        aria-atomic="true"
        role="status"
        style={{ position: 'absolute', left: '-9999px', width: '1px', height: '1px', overflow: 'hidden' }}
      >
        {ariaLiveMessage}
      </div>
    </>
  );
};

export default ChatAppContainer;


