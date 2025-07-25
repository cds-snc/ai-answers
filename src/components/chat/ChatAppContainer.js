import React, { useState, useEffect, useCallback, useRef } from 'react';
import '../../styles/App.css';
import { useTranslations } from '../../hooks/useTranslations.js';
import { usePageContext, DEPARTMENT_MAPPINGS } from '../../hooks/usePageParam.js';
import ChatInterface from './ChatInterface.js';
import { ChatPipelineService, RedactionError, ShortQueryValidation } from '../../services/ChatPipelineService.js';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

// Utility functions go here, before the component
const extractSentences = (paragraph) => {
  const sentenceRegex = /<s-?\d+>(.*?)<\/s-?\d+>/g;
  const sentences = [];
  let match;
  while ((match = sentenceRegex.exec(paragraph)) !== null) {
    sentences.push(match[1].trim());
  }
  return sentences.length > 0 ? sentences : [paragraph];
};

const ChatAppContainer = ({ lang = 'en', chatId, readOnly = false, initialMessages = [] }) => {
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
  const [selectedAI, setSelectedAI] = useState('azure');
  const [selectedSearch, setSelectedSearch] = useState('google'); 
  const [showFeedback, setShowFeedback] = useState(false);
  const [referringUrl, setReferringUrl] = useState(pageUrl || '');
  const [selectedDepartment, setSelectedDepartment] = useState(urlDepartment || '');
  const [turnCount, setTurnCount] = useState(0);
  const messageIdCounter = useRef(0);
  const [displayStatus, setDisplayStatus] = useState('startingToThink');
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
  }, [initialMessages]);

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

  const processNextStatus = useCallback(() => {
    if (statusQueueRef.current.length === 0) {
      statusTimeoutRef.current = null;
      return;
    }

    const nextStatus = statusQueueRef.current.shift();
    setDisplayStatus(nextStatus);

    statusTimeoutRef.current = setTimeout(() => {
      processNextStatus();
    }, 1500);
  }, []);

  const updateStatusWithTimer = useCallback((status) => {
    // Add the new status to the queue
    statusQueueRef.current.push(status);

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
      try {
        const aiMessageId = messageIdCounter.current++;
        const interaction = await ChatPipelineService.processResponse(
          chatId,
          userMessage,
          aiMessageId,
          messages,
          lang,
          selectedDepartment,
          referringUrl,
          selectedAI,
          t,
          updateStatusWithTimer,  // Pass our new status handler
          selectedSearch  // Add this parameter
        );
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
          const userMessageId = messageIdCounter.current++;
          const blockedMessageId = messageIdCounter.current++;
          setMessages(prevMessages => prevMessages.slice(0, -1));
          setMessages(prevMessages => [
            ...prevMessages,
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
          // Remove the user message that was added before the error
          setMessages(prevMessages => prevMessages.slice(0, -1));
          
          // Decrement turn count since this was caught after it was incremented
          setTurnCount(prev => prev - 1);
          
          // Display short query message (will be filtered out of conversation history)
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
          clearInput();
          setIsLoading(false);
          return;
        } else {
          console.error('Error in handleSendMessage:', error);
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
    lang,
    t,
    clearInput,
    selectedDepartment,
    isLoading,
    messages,
    updateStatusWithTimer,
    safeT
  ]);

  useEffect(() => {
    if (pageUrl && !referringUrl) {
      setReferringUrl(pageUrl);
    }
    if (urlDepartment && !selectedDepartment) {
      setSelectedDepartment(urlDepartment);
    }
  }, [pageUrl, urlDepartment, referringUrl, selectedDepartment]);

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
    const displayUrl = message.interaction?.citationUrl || answer.providedCitationUrl || citation.providedCitationUrl || '';
    return (
      <div className="ai-message-content">
        {contentArr.map((content, index) => {
          // If using paragraphs, split into sentences; if using sentences, just display
          const sentences = (answer.paragraphs && Array.isArray(answer.paragraphs))
            ? extractSentences(content)
            : [content];
          return sentences.map((sentence, sentenceIndex) => (
            <p key={`${messageId}-p${index}-s${sentenceIndex}`} className="ai-sentence">
              {sentence}
            </p>
          ));
        })}
        <div className="mistake-disc">
          <p><FontAwesomeIcon icon="wand-magic-sparkles" />&nbsp;
          {safeT('homepage.chat.input.loadingHint')}
        </p>
       </div>
        {answer.answerType === 'normal' && (citationHead || displayUrl) && (
          <div className="citation-container">
            {citationHead && <p key={`${messageId}-head`} className="citation-head">{citationHead}</p>}
            {displayUrl && (
              <p key={`${messageId}-link`} className="citation-link">
                <a href={displayUrl} target="_blank" rel="noopener noreferrer" tabIndex="0">
                  {displayUrl}
                </a>
              </p>
            )}
          </div>
        )}
      </div>
    );
  }, [safeT]);

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
        handleSearchToggle={handleSearchToggle} // Add this line
        handleReferringUrlChange={handleReferringUrlChange}
        formatAIResponse={formatAIResponse}
        selectedAI={selectedAI}
        selectedSearch={selectedSearch} // Add this line
        referringUrl={referringUrl}
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