import React, { useState, useEffect, useCallback, useRef } from 'react';
import '../../styles/App.css';
import { useTranslations } from '../../hooks/useTranslations.js';
import { usePageContext, DEPARTMENT_MAPPINGS } from '../../hooks/usePageParam.js';
import ChatInterface from './ChatInterface.js';
import { ChatPipelineService, RedactionError } from '../../services/ChatPipelineService.js';
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


const ChatAppContainer = ({ lang = 'en', chatId }) => {
  const MAX_CONVERSATION_TURNS = 3;
  const MAX_CHAR_LIMIT = 400;
  const { t } = useTranslations(lang);
  const { url: pageUrl, department: urlDepartment } = usePageContext();
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [textareaKey, setTextareaKey] = useState(0);
  const [selectedAI, setSelectedAI] = useState('azure'); //Changed from on Jan 10 2025
  const [selectedSearch, setSelectedSearch] = useState('canadaca'); 
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
            text: t('homepage.chat.messages.characterLimit'),
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
              text: <div dangerouslySetInnerHTML={{
                __html:
                  (error.redactedText.includes('XXX') ? t('homepage.chat.messages.privateContent') : t('homepage.chat.messages.blockedContent'))
              }} />,
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
              text: t('homepage.chat.messages.error'),
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
    updateStatusWithTimer
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
    let paragraphs = message.interaction.answer.paragraphs;
    if (paragraphs) {
      paragraphs = paragraphs.map(paragraph =>
        paragraph.replace(/<translated-question>.*?<\/translated-question>/g, '')
      );
    }
    const displayUrl = message.interaction.citationUrl;
    const finalConfidenceRating = message.interaction.confidenceRating ? message.interaction.confidenceRating : '0.1';

    const messageDepartment = message?.department || selectedDepartment;

    return (
      <div className="ai-message-content">
        {paragraphs.map((paragraph, index) => {
          const sentences = extractSentences(paragraph);
          return sentences.map((sentence, sentenceIndex) => (
            <p key={`${messageId}-p${index}-s${sentenceIndex}`} className="ai-sentence">
              {sentence}
            </p>
          ));
        })}
        <div className="mistake-disc">
          <p><FontAwesomeIcon icon="wand-magic-sparkles" />&nbsp;
          {t('homepage.chat.input.loadingHint')}
        </p>
       </div>
        {message.interaction.answer.answerType === 'normal' && (message.interaction.answer.citationHead || displayUrl) && (
          <div className="citation-container">
            {message.interaction.answer.citationHead && <p key={`${messageId}-head`} className="citation-head">{message.interaction.answer.citationHead}</p>}
            {displayUrl && (
              <p key={`${messageId}-link`} className="citation-link">
                <a href={displayUrl} target="_blank" rel="noopener noreferrer">
                  {displayUrl}
                </a>
              </p>
            )}
            <p key={`${messageId}-confidence`} className="confidence-rating">
              {finalConfidenceRating !== undefined && `${t('homepage.chat.citation.confidence')} ${finalConfidenceRating}`}
              {finalConfidenceRating !== undefined && (aiService || messageDepartment) && ' | '}
              {aiService && `${t('homepage.chat.citation.ai')} ${aiService}`}
              {messageDepartment && ` | ${messageDepartment}`}
            </p>
          </div>
        )}
      </div>
    );
  }, [t, selectedDepartment]);

  // Add handler for department changes
  const handleDepartmentChange = (department) => {
    setSelectedDepartment(department);
  };

  return (
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
      handleDepartmentChange={handleDepartmentChange}
      handleReferringUrlChange={handleReferringUrlChange}
      formatAIResponse={formatAIResponse}
      selectedAI={selectedAI}
      selectedSearch={selectedSearch} // Add this line
      selectedDepartment={selectedDepartment}
      referringUrl={referringUrl}
      turnCount={turnCount}
      showFeedback={showFeedback}
      displayStatus={displayStatus}
      MAX_CONVERSATION_TURNS={MAX_CONVERSATION_TURNS}
      t={t}
      lang={lang}
      privacyMessage={t('homepage.chat.messages.privacy')}
      getLabelForInput={() => turnCount >= 1 ? t('homepage.chat.input.followUp') : t('homepage.chat.input.initial')}
      extractSentences={extractSentences}
      chatId={chatId}
    />
  );
};

export default ChatAppContainer;