import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import RedactionService from '../../services/RedactionService.js';
import LoggingService from '../../services/LoggingService.js';
import '../../styles/App.css';
import { urlToSearch } from '../../utils/urlToSearch.js';
import { useTranslations } from '../../hooks/useTranslations.js';
import { usePageContext, DEPARTMENT_MAPPINGS } from '../../hooks/usePageParam.js';
import ContextService from '../../services/ContextService.js';
import ChatInterface from './ChatInterface.js';
import MessageService from '../../services/AnswerService.js';

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

// Move parsing logic outside component
const parseMessageContent = (text) => {
  if (!text) {
    return { responseType: 'normal', content: '', preliminaryChecks: null, englishAnswer: null };
  }

  let responseType = 'normal';
  let content = text;
  let preliminaryChecks = null;
  let englishAnswer = null;
  let citationHead = null;
  let citationUrl = null;

  // Extract preliminary checks - this regex needs to capture multiline content
  const preliminaryMatch = /<preliminary-checks>([\s\S]*?)<\/preliminary-checks>/s.exec(text);
  if (preliminaryMatch) {
    preliminaryChecks = preliminaryMatch[1].trim();
    content = content.replace(/<preliminary-checks>[\s\S]*?<\/preliminary-checks>/s, '').trim();
  }

  // Extract citation information before processing answers
  const citationHeadMatch = /<citation-head>(.*?)<\/citation-head>/s.exec(content);
  const citationUrlMatch = /<citation-url>(.*?)<\/citation-url>/s.exec(content);

  if (citationHeadMatch) {
    citationHead = citationHeadMatch[1].trim();
  }
  if (citationUrlMatch) {
    citationUrl = citationUrlMatch[1].trim();
  }

  // Extract English answer first
  const englishMatch = /<english-answer>(.*?)<\/english-answer>/s.exec(content);
  if (englishMatch) {
    englishAnswer = englishMatch[1].trim();
    content = englishAnswer; // Use English answer as content for English questions
  }

  // Extract main answer if it exists
  const answerMatch = /<answer>(.*?)<\/answer>/s.exec(text);
  if (answerMatch) {
    content = answerMatch[1].trim();
  }

  // Check response types
  if (content.includes('<not-gc>')) {
    responseType = 'not-gc';
    content = content.replace(/<\/?not-gc>/g, '').trim();
  } else if (content.includes('<pt-muni>')) {
    responseType = 'pt-muni';
    content = content.replace(/<\/?p?-?pt-muni>/g, '').trim();
  } else if (content.includes('<clarifying-question>')) {
    responseType = 'question';
    content = content.replace(/<\/?clarifying-question>/g, '').trim();
  }

  // Add citation information back to content if it exists
  if (citationHead) {
    content += `\n<citation-head>${citationHead}</citation-head>`;
  }
  if (citationUrl) {
    content += `\n<citation-url>${citationUrl}</citation-url>`;
  }

  return { responseType, content, preliminaryChecks, englishAnswer };
};

const ChatAppContainer = ({ lang = 'en' }) => {
  const { t } = useTranslations(lang);
  const { url: pageUrl, department: urlDepartment } = usePageContext();
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [textareaKey, setTextareaKey] = useState(0);
  const [selectedAI, setSelectedAI] = useState('chatgpt'); //Changed from on Jan 10 2025
  const [showFeedback, setShowFeedback] = useState(false);
  const [checkedCitations, setCheckedCitations] = useState({});
  const [referringUrl, setReferringUrl] = useState(pageUrl || '');
  const [selectedDepartment, setSelectedDepartment] = useState(urlDepartment || '');
  const MAX_CONVERSATION_TURNS = 3;
  const [turnCount, setTurnCount] = useState(0);
  const MAX_CHAR_LIMIT = 400;
  const messageIdCounter = useRef(0);
  const [displayStatus, setDisplayStatus] = useState('startingToThink');
  const [currentDepartment, setCurrentDepartment] = useState('');
  const [currentTopic, setCurrentTopic] = useState('');
  const [currentSearchResults, setCurrentSearchResults] = useState('');
  const [currentDepartmentUrl, setCurrentDepartmentUrl] = useState('');
  const [currentTopicUrl, setCurrentTopicUrl] = useState('');

  // Add a ref to track if we're currently typing
  const isTyping = useRef(false);

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

  const clearInput = useCallback(() => {
    setInputText('');
    setTextareaKey((prevKey) => prevKey + 1);
  }, []);

  const parseAIResponse = useCallback((text, aiService) => {
    const citationHeadRegex = /<citation-head>(.*?)<\/citation-head>/s;
    const citationUrlRegex = /<citation-url>(.*?)<\/citation-url>/s;
    const confidenceRatingRegex = /<confidence>(.*?)<\/confidence>/s;

    const headMatch = text.match(citationHeadRegex);
    const urlMatch = text.match(citationUrlRegex);
    const confidenceMatch = text.match(confidenceRatingRegex);

    let mainContent = text
      .replace(citationHeadRegex, '')
      .replace(citationUrlRegex, '')
      .replace(confidenceRatingRegex, '')
      .trim();

    // Split content into paragraphs, but exclude any remaining citation tags
    const paragraphs = mainContent
      .split(/\n+/)
      .filter(
        (para) =>
          !para.includes('<citation-head>') &&
          !para.includes('<citation-url>') &&
          !para.includes('<confidence>')
      );

    const result = {
      paragraphs,
      citationHead: headMatch ? headMatch[1].trim() : null,
      citationUrl: urlMatch ? urlMatch[1].trim() : null,
      confidenceRating: confidenceMatch ? confidenceMatch[1] : null,
      aiService,
    };

    return result;
  }, []);

  // TODO: Refactor logging to update existing logs with feedback instead of creating duplicates
  // Current behavior creates a new log entry when feedback is provided, resulting in duplicate entries
  // Should implement:
  // 1. LoggingService.updateInteraction method
  // 2. Backend API support for updating existing logs
  // 3. Modify handleFeedback to update instead of create
  const logInteraction = useCallback(
    (
      aiService,
      redactedQuestion,
      referringUrl,
      aiResponse,
      citationUrl,
      originalCitationUrl,
      confidenceRating,
      feedback,
      expertFeedback
    ) => {
      // Parse all components from the AI response
      const { preliminaryChecks, englishAnswer, content } = parseMessageContent(aiResponse);

      // Standardize expert feedback format - only accept new format
      let formattedExpertFeedback = null;
      if (expertFeedback) {
        formattedExpertFeedback = {
          totalScore: expertFeedback.totalScore || null,
          sentence1Score: expertFeedback.sentence1Score || null,
          sentence2Score: expertFeedback.sentence2Score || null,
          sentence3Score: expertFeedback.sentence3Score || null,
          sentence4Score: expertFeedback.sentence4Score || null,
          citationScore: expertFeedback.citationScore || null,
          answerImprovement: expertFeedback.answerImprovement || '',
          expertCitationUrl: expertFeedback.expertCitationUrl || '',
        };
      }

      const logEntry = {
        timestamp: new Date(),
        aiService: aiService || '',
        redactedQuestion,
        referringUrl: referringUrl || '',
        preliminaryChecks: preliminaryChecks || '',
        aiResponse: aiResponse || '',
        englishAnswer: englishAnswer || '',
        answer: content || '',
        originalCitationUrl: originalCitationUrl || '',
        citationUrl: citationUrl || '',
        confidenceRating: confidenceRating || '',
        ...(feedback && { feedback }),
        ...(formattedExpertFeedback && { expertFeedback: formattedExpertFeedback }),
      };

      console.log('Final log entry:', logEntry);

      if (process.env.REACT_APP_ENV === 'production') {
        LoggingService.logInteraction(logEntry, false);
      }
    },
    []
  );

  const handleFeedback = useCallback(
    (isPositive, expertFeedback = null) => {
      const feedback = isPositive ? 'positive' : 'negative';
      console.log(`User feedback: ${feedback}`, expertFeedback);

      // Get the last message (which should be the AI response)
      const lastMessage = messages[messages.length - 1];
      if (lastMessage && lastMessage.sender === 'ai') {
        const { text: aiResponse, aiService: selectedAIService } = lastMessage;
        // Get original URL from AI response
        const { citationUrl: originalCitationUrl, confidenceRating } = parseAIResponse(
          aiResponse,
          selectedAIService
        );
        // Extract preliminaryChecks, englishAnswer, and the displayed answer
        const {
          preliminaryChecks,
          englishAnswer,
          content: answer,
        } = parseMessageContent(aiResponse);

        // Get validated URL from checkedCitations
        const lastIndex = messages.length - 1;
        const validationResult = checkedCitations[lastIndex];
        const finalCitationUrl = validationResult?.url || validationResult?.fallbackUrl;

        // Get the user's message (which should be the second-to-last message)
        const userMessage = messages[messages.length - 2];
        if (userMessage && userMessage.sender === 'user') {
          // Only log if there's feedback
          logInteraction(
            selectedAIService,
            userMessage.redactedText,
            referringUrl,
            aiResponse,
            finalCitationUrl,
            originalCitationUrl,
            confidenceRating,
            feedback,
            expertFeedback
          );
        }
      }
    },
    [messages, checkedCitations, logInteraction, parseAIResponse, referringUrl]
  );

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

  // Define the failover order for each AI service
  const getNextAIService = (currentAI) => {
    const failoverOrder = {
      // always openai until we add another provider
      openai: 'openai',
    };
    return failoverOrder[currentAI];
  };

  const handleSendMessage = useCallback(async () => {
    if (inputText.trim() !== '' && !isLoading) {
      try {
        setIsLoading(true);
        let usedAI = selectedAI;

        // Initial validation checks
        if (inputText.length > MAX_CHAR_LIMIT) {
          const errorMessageId = messageIdCounter.current++;
          setMessages((prevMessages) => [
            ...prevMessages,
            {
              id: errorMessageId,
              text: t('homepage.chat.messages.characterLimit'),
              sender: 'system',
              error: true,
            },
          ]);
          return;
        }

        // First validate and redact the message
        const userMessage = inputText.trim();
        const { redactedText, redactedItems } = RedactionService.redactText(userMessage);

        // Check for blocked content (# for profanity/threats/manipulation, XXX for private info)
        const hasBlockedContent = redactedText.includes('#') || redactedText.includes('XXX');
        if (hasBlockedContent) {
          const userMessageId = messageIdCounter.current++;
          const blockedMessageId = messageIdCounter.current++;
          setMessages((prevMessages) => [
            ...prevMessages,
            {
              id: userMessageId,
              text: redactedText,
              redactedText: redactedText,
              redactedItems: redactedItems,
              sender: 'user',
            },
            {
              id: blockedMessageId,
              text: (
                <div
                  dangerouslySetInnerHTML={{
                    __html:
                      '<i class="fa-solid fa-circle-exclamation"></i>' +
                      (redactedText.includes('XXX')
                        ? t('homepage.chat.messages.privateContent')
                        : t('homepage.chat.messages.blockedContent')),
                  }}
                />
              ),
              sender: 'system',
              error: true,
            },
          ]);
          clearInput();
          return;
        }

        setDisplayStatus('startingToThink');
        // Now that message is validated and redacted, show formatted message with "Starting to think..."
        const userMessageId = messageIdCounter.current++;
        setMessages((prevMessages) => [
          ...prevMessages,
          {
            id: userMessageId,
            text: userMessage,
            redactedText: redactedText,
            redactedItems: redactedItems,
            sender: 'user',
            ...(referringUrl.trim() && { referringUrl: referringUrl.trim() }),
          },
        ]);

        clearInput();

        // Get context only for the first message
        let department = selectedDepartment;
        let topic = '';
        let topicUrl = '';
        let departmentUrl = '';
        let searchResults = '';

        if (turnCount === 0) {
          try {
            const contextMessage = `${redactedText}${referringUrl ? `\n<referring-url>${referringUrl}</referring-url>` : ''}`;
            const derivedContext = await ContextService.deriveContext(
              selectedAI,
              contextMessage,
              lang,
              department
            );
            department = derivedContext.department;
            topic = derivedContext.topic;
            topicUrl = derivedContext.topicUrl;
            departmentUrl = derivedContext.departmentUrl;
            searchResults = derivedContext.searchResults;
            setCurrentDepartment(derivedContext.department);
            setCurrentTopic(derivedContext.topic);
            setCurrentSearchResults(derivedContext.searchResults);
            setCurrentDepartmentUrl(derivedContext.departmentUrl);
            setCurrentTopicUrl(derivedContext.topicUrl);
            console.log('Derived context:', {
              department,
              topic,
              topicUrl,
              departmentUrl,
              searchResults,
            });
          } catch (error) {
            console.error('Error deriving context:', error);
            department = '';
            topic = '';
            setCurrentDepartment('');
            setCurrentTopic('');
          }
        } else {
          // Load the variables for the context that are saved in the React state
          department = currentDepartment;
          topic = currentTopic;
          topicUrl = currentTopicUrl;
          departmentUrl = currentDepartmentUrl;
          searchResults = currentSearchResults;
        }

        // Replace empty values with blank strings
        department = department || '';
        topic = topic || '';
        const context = { department, topic, topicUrl, departmentUrl, searchResults };

        if (department && topic) {
          setDisplayStatus('thinkingWithContext');
        } else {
          setDisplayStatus('thinking');
        }

        // Get conversation history for context
        const conversationHistory = messages
          .filter((m) => !m.temporary)
          .map((m) => ({
            role: m.sender === 'user' ? 'user' : 'assistant',
            content: m.redactedText || m.text,
          }));
        // Create formatted message with referring URL (add this before the first try block)
        const messageWithReferrer = `${redactedText}${
          referringUrl.trim() ? `\n<referring-url>${referringUrl.trim()}</referring-url>` : ''
        }}`;
        // Try primary AI service first, yes first
        try {
          const response = await MessageService.sendMessage(
            selectedAI,
            messageWithReferrer,
            conversationHistory,
            lang,
            context
          );

          console.log(`✅ ${selectedAI} response:`, response);
          // Parse the response for citations
          const { citationUrl: originalCitationUrl } = parseAIResponse(response, usedAI);

          console.log(`✅ ${selectedAI} citation URL:`, originalCitationUrl);

          // Generate new message ID early
          const newMessageId = messageIdCounter.current++;

          // Validate URL if present
          let finalCitationUrl, confidenceRating;
          if (originalCitationUrl) {
            const validationResult = await urlToSearch.validateAndCheckUrl(
              originalCitationUrl,
              lang,
              redactedText,
              selectedDepartment,
              t
            );

            console.log(`✅ Validated URL:`, validationResult);

            // Store validation result in checkedCitations
            setCheckedCitations((prev) => ({
              ...prev,
              [newMessageId]: {
                url: validationResult?.url,
                fallbackUrl: validationResult?.fallbackUrl,
                confidenceRating: validationResult?.confidenceRating || '0.1',
                finalCitationUrl: validationResult?.url || validationResult?.fallbackUrl,
              },
            }));

            finalCitationUrl = validationResult?.url || validationResult?.fallbackUrl;
            confidenceRating = validationResult?.confidenceRating || '0.1';
          }

          // Add the AI response to messages using addMessage
          // Add message with the new ID
          setMessages((prev) => [
            ...prev,
            {
              id: newMessageId,
              text: response,
              sender: 'ai',
              aiService: usedAI,
              department: department,
            },
          ]);

          setTurnCount((prev) => prev + 1);
          setShowFeedback(true);

          // Log the interaction with the validated URL
          logInteraction(
            selectedAI,
            redactedText,
            referringUrl,
            response,
            finalCitationUrl,
            originalCitationUrl,
            confidenceRating,
            null, // feedback
            null // expertFeedback
          );
        } catch (error) {
          console.error(`Error with ${selectedAI}:`, error);

          // Try fallback AI service
          // TODO - This needs to be refactored to retry a fixe number of times
          const fallbackAI = getNextAIService(selectedAI);

          try {
            // Try fallback AI service
            const fallbackResponse = await MessageService.sendMessage(
              fallbackAI,
              messageWithReferrer,
              conversationHistory,
              lang,
              context
            );

            // Add the fallback AI response
            const fallbackMessageId = messageIdCounter.current++;

            const { citationUrl: fallbackCitationUrl } = parseAIResponse(fallbackResponse, usedAI);

            let finalCitationUrl;
            if (fallbackCitationUrl) {
              const validationResult = await urlToSearch.validateAndCheckUrl(
                fallbackCitationUrl,
                lang,
                redactedText,
                selectedDepartment,
                t
              );

              // Store validation result in checkedCitations
              setCheckedCitations((prev) => ({
                ...prev,
                [fallbackMessageId]: {
                  url: validationResult?.url,
                  fallbackUrl: validationResult?.fallbackUrl,
                  confidenceRating: validationResult?.confidenceRating || '0.1',
                  finalCitationUrl: validationResult?.url || validationResult?.fallbackUrl,
                },
              }));
            }

            setMessages((prevMessages) => [
              ...prevMessages,
              {
                id: fallbackMessageId,
                text: fallbackResponse,
                sender: 'ai',
                aiService: fallbackAI,
              },
            ]);

            setTurnCount((prev) => prev + 1);
            setShowFeedback(true);
            setDisplayStatus('thinkingMore');

            // Log the fallback interaction
            const { citationUrl: originalCitationUrl, confidenceRating } = parseAIResponse(
              fallbackResponse,
              fallbackAI
            );
            logInteraction(
              fallbackAI,
              redactedText,
              referringUrl,
              fallbackResponse,
              finalCitationUrl,
              originalCitationUrl,
              confidenceRating
            );
          } catch (fallbackError) {
            console.error(`Error with fallback ${fallbackAI}:`, fallbackError);
            const errorMessageId = messageIdCounter.current++;
            setMessages((prevMessages) => [
              ...prevMessages,
              {
                id: errorMessageId,
                text: t('homepage.chat.messages.error'),
                sender: 'system',
                error: true,
              },
            ]);
          }
        }
      } catch (error) {
        console.error('Error in handleSendMessage:', error);
        const errorMessageId = messageIdCounter.current++;
        setMessages((prevMessages) => [
          ...prevMessages,
          {
            id: errorMessageId,
            text: t('homepage.chat.messages.error'),
            sender: 'system',
            error: true,
          },
        ]);
      } finally {
        setIsLoading(false);
      }
    }
  }, [
    inputText,
    referringUrl,
    selectedAI,
    lang,
    t,
    clearInput,
    selectedDepartment,
    isLoading,
    logInteraction,
    messages,
    parseAIResponse,
    turnCount,
    currentDepartment,
    currentDepartmentUrl,
    currentSearchResults,
    currentTopic,
    currentTopicUrl,
  ]);

  useEffect(() => {
    if (pageUrl && !referringUrl) {
      setReferringUrl(pageUrl);
    }

    if (urlDepartment && !selectedDepartment) {
      setSelectedDepartment(urlDepartment);
    }
  }, [pageUrl, urlDepartment, referringUrl, selectedDepartment]);

  // Memoize the parsed responses with better message tracking
  const parsedResponses = useMemo(() => {
    if (isTyping.current) return {};

    const responses = {};
    const processedIds = new Set();

    messages.forEach((message) => {
      if (message.sender === 'ai' && !processedIds.has(message.id) && message.id !== undefined) {
        processedIds.add(message.id);
        // console.log(`Parsing message ${message.id}:`, message.text.substring(0, 100) + '...');

        const { responseType, content } = parseMessageContent(message.text);
        const { paragraphs, citationHead } = parseAIResponse(content, message.aiService);

        responses[message.id] = {
          responseType,
          paragraphs,
          citationHead,
          aiService: message.aiService,
        };
      }
    });
    return responses;
  }, [messages, parseAIResponse]);

  const formatAIResponse = useCallback(
    (text, aiService, messageId) => {
      if (!isTyping.current && messageId !== undefined) {
        // console.log('Formatting message:', messageId);
      }

      const parsedResponse = parsedResponses[messageId];
      if (!parsedResponse) return null;

      // Clean up any instruction tags from the paragraphs
      if (parsedResponse.paragraphs) {
        parsedResponse.paragraphs = parsedResponse.paragraphs.map((paragraph) =>
          paragraph.replace(/<translated-question>.*?<\/translated-question>/g, '')
        );
      }

      const citationResult = checkedCitations[messageId];
      const displayUrl =
        citationResult?.finalCitationUrl || citationResult?.url || citationResult?.fallbackUrl;
      const finalConfidenceRating = citationResult ? citationResult.confidenceRating : '0.1';

      // Find the message to get its department
      const message = messages.find((m) => m.id === messageId);
      const messageDepartment = message?.department || selectedDepartment;

      return (
        <div className="ai-message-content">
          {parsedResponse.paragraphs.map((paragraph, index) => {
            const sentences = extractSentences(paragraph);
            return sentences.map((sentence, sentenceIndex) => (
              <p key={`${messageId}-p${index}-s${sentenceIndex}`} className="ai-sentence">
                {sentence}
              </p>
            ));
          })}
          {parsedResponse.responseType === 'normal' &&
            (parsedResponse.citationHead || displayUrl) && (
              <div className="citation-container">
                {parsedResponse.citationHead && (
                  <p key={`${messageId}-head`} className="citation-head">
                    {parsedResponse.citationHead}
                  </p>
                )}
                {displayUrl && (
                  <p key={`${messageId}-link`} className="citation-link">
                    <a href={displayUrl} target="_blank" rel="noopener noreferrer">
                      {displayUrl}
                    </a>
                  </p>
                )}
                <p key={`${messageId}-confidence`} className="confidence-rating">
                  {finalConfidenceRating !== undefined &&
                    `${t('homepage.chat.citation.confidence')} ${finalConfidenceRating}`}
                  {finalConfidenceRating !== undefined && (aiService || messageDepartment) && ' | '}
                  {aiService && `${t('homepage.chat.citation.ai')} ${aiService}`}
                  {messageDepartment && ` | ${messageDepartment}`}
                </p>
              </div>
            )}
        </div>
      );
    },
    [parsedResponses, checkedCitations, t, selectedDepartment, messages]
  );

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
      handleDepartmentChange={handleDepartmentChange}
      handleReferringUrlChange={handleReferringUrlChange}
      handleFeedback={handleFeedback}
      formatAIResponse={formatAIResponse}
      selectedAI={selectedAI}
      selectedDepartment={selectedDepartment}
      referringUrl={referringUrl}
      turnCount={turnCount}
      showFeedback={showFeedback}
      displayStatus={displayStatus}
      currentDepartment={currentDepartment}
      currentTopic={currentTopic}
      currentSearchResults={currentSearchResults}
      MAX_CONVERSATION_TURNS={MAX_CONVERSATION_TURNS}
      t={t}
      lang={lang}
      privacyMessage={t('homepage.chat.messages.privacy')}
      getLabelForInput={() =>
        turnCount >= 1 ? t('homepage.chat.input.followUp') : t('homepage.chat.input.initial')
      }
      extractSentences={extractSentences}
      parsedResponses={parsedResponses}
      checkedCitations={checkedCitations}
    />
  );
};

export default ChatAppContainer;
