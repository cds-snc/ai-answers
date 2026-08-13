import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslations } from '../../hooks/useTranslations.js';
import { usePageContext, DEPARTMENT_MAPPINGS } from '../../hooks/usePageParam.js';
import ChatInterface from './ChatInterface.js';
import { ChatWorkflowService, RedactionError, ShortQueryValidation, ChatRunInProgressError } from '../../services/ChatWorkflowService.js';


import DataStoreService from '../../services/DataStoreService.js';
import AuthService from '../../services/AuthService.js';
import { AVAILABLE_MODELS, MODEL_VALUES, WORKFLOW_VALUES, DEFAULT_WORKFLOW } from '../../config/workflows.js';
import { safeHttpHref } from '../../utils/safeUrl.js';
import { buildAriaLabel } from '../../utils/citationAriaLabel.js';
import { getCitationUrl } from '../../utils/getCitationUrl.js';
import { getAnswerLanguage, toLangAttr } from '../../utils/answerLanguage.js';

// Minimum gap between real-backend-status live-region announcements, so a
// fast-moving backend can't fire several in rapid succession — see the
// throttled status-announce effect in ChatAppContainer.
const STATUS_ANNOUNCE_THROTTLE_MS = 4000;

// Minimum gap since the last status announcement (real or fallback) before
// the "still working" reassurance fires — see the fallback effect below,
// which shares this clock with the throttled effect above so the two can't
// land back to back.
const STILL_WORKING_INTERVAL_MS = 6000;

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
  // A stored value is an *override*: this admin has deliberately chosen
  // something other than what Settings says, and it sticks until they pick
  // "use system settings" again. Without a stored value we follow the
  // configured default, and the dropdown says so rather than naming a
  // workflow/model that only looks like a deliberate choice.
  const readStoredOverride = (key, allowed) => {
    try {
      const val = localStorage.getItem(storageKey(key));
      return allowed.includes(val) ? val : null;
    } catch (e) {
      return null;
    }
  };
  const clearStoredOverride = (key) => {
    try {
      localStorage.removeItem(storageKey(key));
    } catch (e) {
      // ignore storage errors
    }
  };

  // TODO(follow-up, PR #1684 review): modelIsOverride/workflowIsOverride (below)
  // are separate state from selectedAI/workflow rather than derived from them.
  // The invariant "isOverride === (value came from localStorage, not the
  // fetched default)" is only maintained by convention across every call site
  // that touches these — handleAIToggle/handleWorkflowChange, the persist
  // effects, the fetch-default effects. Fine today since all of it is in this
  // one file, but fragile for the next edit; consider deriving isOverride from
  // whether the stored key exists rather than tracking it as parallel state.
  const [selectedAI, setSelectedAI] = useState(() => readStoredOverride('selectedAI', MODEL_VALUES));
  const [modelIsOverride, setModelIsOverride] = useState(
    () => readStoredOverride('selectedAI', MODEL_VALUES) !== null
  );
  const [selectedSearch, setSelectedSearch] = useState(() => {
    try {
      return localStorage.getItem(storageKey('selectedSearch')) || 'google';
    } catch (e) {
      return 'google';
    }
  });
  const [workflow, setWorkflow] = useState(() => readStoredOverride('workflow', WORKFLOW_VALUES));
  const [workflowIsOverride, setWorkflowIsOverride] = useState(
    () => readStoredOverride('workflow', WORKFLOW_VALUES) !== null
  );
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
  const [errorAlert, setErrorAlert] = useState('');
  const userLeftChatRef = useRef(false);
  const stillWorkingTimerRef = useRef(null);
  const lastStatusAnnounceTimeRef = useRef(0);
  const pendingStatusAnnounceTimeoutRef = useRef(null);

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

  // Sync initialReferringUrl when it arrives asynchronously (e.g. after chat
  // data is fetched in review mode). useState only captures the initial null.
  useEffect(() => {
    if (initialReferringUrl) {
      setReferringUrl(initialReferringUrl);
    }
  }, [initialReferringUrl]);
  // This effect sets up a resize listener to update isMobile state for citation icon and link styling
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 480);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  // Announce via live region using clear → set for reliable AT re-read (avoids JAWS duplicate suppression)
  const announceToLiveRegion = useCallback((text) => {
    setAriaLiveMessage('');
    setTimeout(() => setAriaLiveMessage(text), 100);
  }, []);

  // Track if user navigated outside the chat during loading.
  // Resets when loading starts; set to true on focusout to outside the chat container.
  useEffect(() => {
    if (!isLoading) return;
    userLeftChatRef.current = false;
    const chatEl = document.querySelector('.chat-container');
    if (!chatEl) return;
    const handleFocusOut = (e) => {
      if (e.relatedTarget && !chatEl.contains(e.relatedTarget)) {
        userLeftChatRef.current = true;
      }
    };
    chatEl.addEventListener('focusout', handleFocusOut);
    return () => chatEl.removeEventListener('focusout', handleFocusOut);
  }, [isLoading]);

  // The "AI can make mistakes" disclaimer is now folded into the loading
  // container's aria-label (ChatInterface.js), announced atomically at
  // focus-time instead of as a separate announcement 1s later — a fast
  // response could interrupt the old delayed version mid-sentence. The
  // throttled status effect below still deliberately can't announce before
  // ~4s, giving that combined announcement room to finish uninterrupted.

  // Real backend progress (searching, building context, verifying citation,
  // ...), throttled to at most one announcement every
  // STATUS_ANNOUNCE_THROTTLE_MS — a fast-moving backend can advance through
  // several stages a second apart, and narrating every one of those is more
  // noise than help. If several stages complete inside one throttle window,
  // only the latest gets announced once the window opens. The throttle
  // baseline resets to "now" whenever a request starts (the
  // displayStatus === 'moderatingQuestion' branch below), so the earliest a
  // real stage can be announced is ~4s in — after the guaranteed hint above.
  useEffect(() => {
    if (!isLoading) {
      lastStatusAnnounceTimeRef.current = 0;
      clearTimeout(pendingStatusAnnounceTimeoutRef.current);
      return;
    }
    if (displayStatus === 'moderatingQuestion') {
      lastStatusAnnounceTimeRef.current = Date.now();
      clearTimeout(pendingStatusAnnounceTimeoutRef.current);
      return;
    }

    const announceNow = () => {
      lastStatusAnnounceTimeRef.current = Date.now();
      announceToLiveRegion(safeT(`homepage.chat.messages.${displayStatus}`));
    };

    const elapsed = Date.now() - lastStatusAnnounceTimeRef.current;
    clearTimeout(pendingStatusAnnounceTimeoutRef.current);
    if (elapsed >= STATUS_ANNOUNCE_THROTTLE_MS) {
      announceNow();
    } else {
      pendingStatusAnnounceTimeoutRef.current = setTimeout(announceNow, STATUS_ANNOUNCE_THROTTLE_MS - elapsed);
    }

    return () => clearTimeout(pendingStatusAnnounceTimeoutRef.current);
  }, [isLoading, displayStatus, safeT, announceToLiveRegion]);

  // Fallback reassurance if the request goes quiet for a while — shares the
  // same clock (lastStatusAnnounceTimeRef) the throttled effect above writes
  // to on every real announcement, instead of an independent fixed timer, so
  // the two can't fire back to back. Each check either announces (if nothing
  // else has been said in the last STILL_WORKING_INTERVAL_MS) or reschedules
  // itself for whenever that window will next be up — so a real announcement
  // always pushes the fallback back out, and a long-running request still
  // gets occasional reassurance without ever duplicating a recent one.
  useEffect(() => {
    if (!isLoading) {
      clearTimeout(stillWorkingTimerRef.current);
      return;
    }

    const checkAndScheduleNext = () => {
      const elapsed = Date.now() - lastStatusAnnounceTimeRef.current;
      if (elapsed >= STILL_WORKING_INTERVAL_MS) {
        lastStatusAnnounceTimeRef.current = Date.now();
        announceToLiveRegion(safeT('homepage.chat.messages.thinkingMore'));
        stillWorkingTimerRef.current = setTimeout(checkAndScheduleNext, STILL_WORKING_INTERVAL_MS);
      } else {
        stillWorkingTimerRef.current = setTimeout(checkAndScheduleNext, STILL_WORKING_INTERVAL_MS - elapsed);
      }
    };

    stillWorkingTimerRef.current = setTimeout(checkAndScheduleNext, STILL_WORKING_INTERVAL_MS);
    return () => clearTimeout(stillWorkingTimerRef.current);
  }, [isLoading, safeT, announceToLiveRegion]);

  // Announce outcomes once loading ends.
  useEffect(() => {
    if (isLoading) return;

    const lastMessage = messages[messages.length - 1];
    if (!lastMessage) return;

    if (lastMessage.sender === 'ai' && !lastMessage.error) {
      if (userLeftChatRef.current) {
        // User navigated away — announce politely so they know to come back.
        announceToLiveRegion(safeT('homepage.chat.messages.answerReady'));
      } else {
        // Focus management in ChatInterface moves focus to the new AI message,
        // so the screen reader reads it naturally. Clear the live region to avoid double-announcing.
        setAriaLiveMessage('');
      }
    } else if (lastMessage.sender === 'user' && !lastMessage.error) {
      setAriaLiveMessage(lastMessage.text || '');
    } else if (lastMessage.error) {
      // Only fire alert if user navigated away — focus management handles the in-situ case.
      if (userLeftChatRef.current) {
        const cue = safeT('homepage.chat.messages.chatIssue');
        setErrorAlert(cue);
        setTimeout(() => setErrorAlert(''), 1000);
      }
    }
  }, [isLoading, messages, safeT]);

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

  // An empty value is the "use system settings" entry: drop the stored
  // override and null the state so the fetch effect below reloads whatever
  // Settings currently says.
  const handleAIToggle = (e) => {
    const value = e.target.value;
    if (!value) {
      clearStoredOverride('selectedAI');
      setModelIsOverride(false);
      setSelectedAI(null);
      return;
    }
    setModelIsOverride(true);
    setSelectedAI(value);
  };

  const handleSearchToggle = (e) => {
    setSelectedSearch(e.target.value);
    console.log('Search toggled to:', e.target.value);
  };

  // Persist selection changes to localStorage. Only the admin's own choice is
  // stored — never the fetched model.default, which must keep following the
  // Settings value.
  useEffect(() => {
    try {
      if (modelIsOverride && selectedAI !== null && selectedAI !== undefined) {
        localStorage.setItem(storageKey('selectedAI'), selectedAI);
      }
    } catch (e) {
      // ignore storage errors
    }
  }, [modelIsOverride, selectedAI]);

  // Fetch the configured default model family from Settings on mount.
  // AVAILABLE_MODELS[0] is the canonical fallback when model.default has never
  // been saved (e.g. first deploy with the new setting).
  useEffect(() => {
    let mounted = true;
    const loadProvider = async () => {
      if (selectedAI === null) {
        try {
          const model = await DataStoreService.getPublicSetting('model.default', null);
          if (mounted) {
            setSelectedAI(MODEL_VALUES.includes(model) ? model : AVAILABLE_MODELS[0].value);
          }
        } catch (err) {
          if (mounted) setSelectedAI(AVAILABLE_MODELS[0].value);
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

  // With no local override, load the configured default workflow so the Options
  // dropdown shows the workflow the server will actually run. Without this the
  // select falls back to rendering its first option, which misreports the
  // workflow whenever workflow.default is set to anything else. Does not mark
  // the value as user-set, so it isn't persisted to localStorage.
  //
  // TODO(follow-up, PR #1684 review): fetched once per mount and cached for the
  // tab's lifetime — an admin changing workflow.default in Settings won't reach
  // an already-open tab until reload. This mirrors model.default's existing,
  // pre-PR fetch-once behavior below, so it's consistent rather than a new
  // regression, but the underlying "no live update" tradeoff for both is worth
  // a deliberate decision (e.g. re-fetch on window focus, or a settings-changed
  // event) rather than being carried forward implicitly.
  useEffect(() => {
    let mounted = true;
    const loadDefaultWorkflow = async () => {
      if (workflow === null) {
        try {
          const defaultWorkflow = await DataStoreService.getPublicSetting('workflow.default', null);
          if (mounted) {
            setWorkflow(WORKFLOW_VALUES.includes(defaultWorkflow) ? defaultWorkflow : DEFAULT_WORKFLOW);
          }
        } catch (err) {
          if (mounted) setWorkflow(DEFAULT_WORKFLOW);
        }
      }
    };
    loadDefaultWorkflow();
    return () => { mounted = false; };
  }, [workflow]);

  useEffect(() => {
    try {
      // Only the admin's own choice is stored — never the fetched
      // workflow.default, which must keep following the Settings value.
      if (workflowIsOverride && workflow !== null) {
        localStorage.setItem(storageKey('workflow'), workflow);
      }
    } catch (e) {
      // ignore storage errors
    }
  }, [workflowIsOverride, workflow]);

  // An empty value is the "use system settings" entry: drop the stored
  // override and null the state so the fetch effect above reloads whatever
  // Settings currently says.
  const handleWorkflowChange = (e) => {
    const value = e.target.value;
    if (!value) {
      clearStoredOverride('workflow');
      setWorkflowIsOverride(false);
      setWorkflow(null);
      return;
    }
    setWorkflowIsOverride(true);
    setWorkflow(value);
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

      // Clear any pending status updates from previous requests and reset display
      if (statusTimeoutRef.current) {
        clearTimeout(statusTimeoutRef.current);
        statusTimeoutRef.current = null;
      }
      statusQueueRef.current = [];
      setDisplayStatus('moderatingQuestion');

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
      const overrideUserId = AuthService.getUserId ? AuthService.getUserId() : (AuthService.currentUser?.userId ?? null);
      try {
        const aiMessageId = messageIdCounter.current++;
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

        // Capture server-generated chatId (if this was the first request)
        if (interaction?.chatId && onChatIdUpdate) {
          onChatIdUpdate(interaction.chatId);
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
        if (error instanceof RedactionError) {
          if (error.redactedText.includes('XXX')) {
            // Privacy (XXX): single combined system bubble — one bounding box for question + warning
            const redactionMessageId = messageIdCounter.current++;
            setMessages(prevMessages => [
              ...prevMessages.slice(0, -1),
              {
                id: redactionMessageId,
                redactedText: error.redactedText,
                redactedItems: error.redactedItems,
                text: safeT('homepage.chat.messages.privateContent'),
                sender: 'system',
                error: true,
                isRedactionError: true,
                ...(error.historySignature ? { historySignature: error.historySignature } : {})
              }
            ]);
          } else {
            // Blocked (###): keep user bubble so the user can see their original message, error box below
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
                text: safeT('homepage.chat.messages.blockedContent'),
                sender: 'system',
                error: true,
                isRedactionError: true,
                isBlockedError: true,
                ...(error.historySignature ? { historySignature: error.historySignature } : {})
              }
            ]);
          }
          clearInput();
          setIsLoading(false);
          return;
        } else if (error instanceof ShortQueryValidation) {
          // Consolidate into one system bubble, same as the redaction paths:
          // the original question rolls into the reply (quoted in the search
          // link below) rather than staying its own bubble.
          const shortQueryMessageId = messageIdCounter.current++;
          setMessages(prevMessages => [
            ...prevMessages.slice(0, -1),
            {
              id: shortQueryMessageId,
              text: safeT('homepage.chat.messages.shortQueryMessage'),
              searchUrl: error.searchUrl,
              searchQuery: error.userMessage,
              sender: 'system',
              error: true,
              ...(error.historySignature ? { historySignature: error.historySignature } : {})
            }
          ]);
          clearInput();
          setIsLoading(false);
          return;
        } else {
          console.error('Error in handleSendMessage:', error);
          try {
            console.log('handleSendMessage: caught error details', {
              name: error?.name,
              message: error?.message,
              historySignature: error?.historySignature,
              stack: error?.stack
            });
          } catch (e) {
            // ignore logging errors
          }

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
            try {
              console.log('handleSendMessage: mapping 403->sessionTimedOut', { message: error?.message, historySignature: error?.historySignature });
            } catch (e) {
              // ignore logging errors
            }
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

          if (error instanceof ChatRunInProgressError) {
            const inProgressMessageId = messageIdCounter.current++;
            setMessages(prevMessages => [
              ...prevMessages,
              {
                id: inProgressMessageId,
                text: safeT('homepage.chat.messages.chatRunInProgress'),
                sender: 'system',
                error: true,
              }
            ]);
            setIsLoading(false);
            return;
          }

          try {
            console.log('handleSendMessage: falling back to generic error branch', { historySignature: error?.historySignature });
          } catch (e) {
            // ignore logging errors
          }

          const errorMessageId = messageIdCounter.current++;
          setMessages(prevMessages => [
            ...prevMessages,
            {
              id: errorMessageId,
              text: safeT('homepage.chat.messages.error'),
              sender: 'system',
              error: true,
              ...(error.historySignature ? { historySignature: error.historySignature } : {})
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
    // displayUrl is the citation URL to show and use for analytics
    const displayUrl = getCitationUrl(message.interaction);
    // interactionId is the message id (client-side userMessageId)
    const interactionId = messageId || message.interaction?.interactionId || message.interaction?.userMessageId || '';
    const answerLang = toLangAttr(getAnswerLanguage(message.interaction));
    return (
      <div className="ai-message-content">
        {contentArr.map((content, index) => {
          // If using paragraphs, split into sentences; if using sentences, just display
          const rawSentences = (answer.paragraphs && Array.isArray(answer.paragraphs))
            ? extractSentences(content)
            : [content];
          // Drop blanks: an empty <s-N></s-N> tag (translation collapsed a sentence) or a
          // paragraph left empty after the <translated-question> strip above would otherwise
          // render as an empty <p>.
          const sentences = rawSentences.filter(
            (sentence) => typeof sentence === 'string' && sentence.trim()
          );
          return sentences.map((sentence, sentenceIndex) => (
            <p key={`${messageId}-p${index}-s${sentenceIndex}`} className="ai-sentence" lang={answerLang}>
              {decodeHTMLEntities(sentence)}
            </p>
          ));
        })}
        {displayUrl && (
          <>
            <hr className="citation-divider" aria-hidden="true" />
            <div className="citation-container">
              <p key={`${messageId}-head`} className="citation-head">{safeT('homepage.chat.citation.heading')}</p>
              <ul key={`${messageId}-link`} className="citation-link list-disc">
                  <li>
                    {/* Intentionally a raw <a>, not <GcdsLink>: the Adobe
                        Analytics onClick tracker doesn't fire reliably
                        through GcdsLink (tested), and this link needs a
                        custom URL-based aria-label plus its own icon/URL-
                        wrap layout — neither tried on GcdsLink.
                        Not part of the "align to GcdsLink" TODOs elsewhere. */}
                    <a
                      href={safeHttpHref(displayUrl)}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={buildAriaLabel(displayUrl, lang)}
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
                      <span className="citation-url-text font-size-text-small">
                        {(() => {
                          // Mobile: always render full URL, CSS handles ellipsis
                          if (isMobile) {
                            return (
                              <>
                                {displayUrl}
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

  // The Options dropdowns below are passed an explicit override, or '' — the
  // "use system settings" entry — when we are following Settings, so an admin
  // can always tell which of the two they are looking at.
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
        workflowSelection={workflowIsOverride ? workflow : ''}
        handleWorkflowChange={handleWorkflowChange}
        handleReferringUrlChange={handleReferringUrlChange}
        formatAIResponse={formatAIResponse}
        modelSelection={modelIsOverride ? selectedAI : ''}
        selectedSearch={selectedSearch}
        referringUrl={referringUrl}
        chatCreatedAt={chatCreatedAt}
        turnCount={turnCount}
        showFeedback={showFeedback}
        displayStatus={displayStatus}
        MAX_CONVERSATION_TURNS={MAX_CONVERSATION_TURNS}
        t={t}
        lang={lang}
        extractSentences={extractSentences}
        chatId={chatId}
        readOnly={readOnly}
        userLeftChatRef={userLeftChatRef}
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
      {errorAlert && (
        <div role="alert" className="sr-only">
          {errorAlert}
        </div>
      )}
    </>
  );
};

export default ChatAppContainer;
