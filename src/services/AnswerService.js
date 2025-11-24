// src/ClaudeService.js

import { getApiUrl } from '../utils/apiToUrl.js';
import ClientLoggingService from './ClientLoggingService.js';
import ScenarioOverrideService from './ScenarioOverrideService.js';

import AuthService from './AuthService.js';

const AnswerService = {
  prepareMessage: async (
    provider,
    conversationHistory = [],
    lang = 'en',
    context,
    referringUrl,
    chatId,
    overrideUserId = null
  ) => {
    ClientLoggingService.info(chatId, `Processing message in ${lang.toUpperCase()}`);

    let scenarioOverrideText = null;
    if (overrideUserId && context && context.department) {
      try {
        scenarioOverrideText = await ScenarioOverrideService.getOverrideForDepartment(context.department);
        if (scenarioOverrideText) {
          ClientLoggingService.info(chatId, `Applying scenario override for ${context.department}`, { overrideUserId });
        }
      } catch (error) {
        ClientLoggingService.warn(chatId, `Failed to load scenario override for ${context.department}`, { error: error?.message });
      }
    }
    const { translatedQuestion, outputLang } = context;
    const header = `\n<output-lang>${outputLang || ''}</output-lang>`;
    let message = `${translatedQuestion}${header}`;
    message = `${message}${referringUrl.trim() ? `\n<referring-url>${referringUrl.trim()}</referring-url>` : ''}`;
    ClientLoggingService.debug(chatId, 'Sending to ' + provider + ' API:', {
      message,
      conversationHistory: conversationHistory,
    });

    // Send structured context to the server and let it build the system prompt.
    return {
      provider: provider,
      message: message,
      conversationHistory: conversationHistory,
      chatId: chatId,
      lang: lang,
      department: context?.department || '',
      topic: context?.topic || '',
      topicUrl: context?.topicUrl || '',
      departmentUrl: context?.departmentUrl || '',
      searchResults: context?.searchResults || '',
      scenarioOverrideText: scenarioOverrideText || '',
    };
  },

  sendMessage: async (
    provider,
    conversationHistory = [],
    lang = 'en',
    context,
    referringUrl,
    chatId,
    overrideUserId = null
  ) => {
    try {
      const messagePayload = await AnswerService.prepareMessage(
        provider,
        conversationHistory,
        lang,
        context,
        referringUrl,
        chatId,
        overrideUserId
      );


      const response = await AuthService.fetch(getProviderApiUrl(provider, 'message'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(messagePayload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        ClientLoggingService.error(chatId, provider + ' API error response:', errorText);
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      ClientLoggingService.debug(chatId, provider + ' API response:', data);
      const parsedResponse = AnswerService.parseResponse(data.content);
      const mergedResponse = { ...data, ...parsedResponse };
      mergedResponse.questionLanguage = context.originalLang;
      mergedResponse.englishQuestion = context.translatedQuestion;
      return mergedResponse;
    } catch (error) {
      ClientLoggingService.error(chatId, 'Error calling ' + provider + ' API:', error);
      throw error;
    }
  },
  parseSentences: (text) => {
    const sentenceRegex = /<s-(\d+)>(.*?)<\/s-\d+>/g;
    const sentences = [];
    let match;

    while ((match = sentenceRegex.exec(text)) !== null) {
      const index = parseInt(match[1]) - 1;
      if (index >= 0 && index < 4 && match[2].trim()) {
        sentences[index] = match[2].trim();
      }
    }

    // If no sentence tags found, treat entire text as first sentence
    if (sentences.length === 0 && text.trim()) {
      sentences[0] = text.trim();
    }

    return Array(4)
      .fill('')
      .map((_, i) => sentences[i] || '');
  },
  parseResponse: (text) => {
    if (!text) {
      return { answerType: 'normal', content: '', preliminaryChecks: null, englishAnswer: null };
    }

    let answerType = 'normal';
    let content = text;
    let preliminaryChecks = null;
    let englishAnswer = null;
    let citationHead = null;
    let citationUrl = null;
    let confidenceRating = null;

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
    const englishMatch = /<english-answer>([\s\S]*?)<\/english-answer>/s.exec(content);
    if (englishMatch) {
      englishAnswer = englishMatch[1].trim();
      content = englishAnswer;  // Use English answer as content for English questions
    }

    // Extract main answer if it exists
    const answerMatch = /<answer>([\s\S]*?)<\/answer>/s.exec(text);
    if (answerMatch) {
      content = answerMatch[1].trim();
    }
    content = content.replace(/<citation-head>[\s\S]*?<\/citation-head>/s, '').trim();
    content = content.replace(/<citation-url>[\s\S]*?<\/citation-url>/s, '').trim();
    content = content.replace(/<confidence>(.*?)<\/confidence>/s, '').trim();

    // Check for special tags in either english-answer or answer content
    const specialTags = {
      'not-gc': /<not-gc>([\s\S]*?)<\/not-gc>/,
      'pt-muni': /<pt-muni>([\s\S]*?)<\/pt-muni>/,
      'clarifying-question': /<clarifying-question>([\s\S]*?)<\/clarifying-question>/
    };

    // Check each special tag type and extract their content
    for (const [type, regex] of Object.entries(specialTags)) {
      const englishTagMatch = englishAnswer && regex.exec(englishAnswer);
      const contentTagMatch = content && regex.exec(content);

      if (englishTagMatch || contentTagMatch) {
        answerType = type;
        if (englishTagMatch) {
          englishAnswer = englishTagMatch[1].trim();
        }
        if (contentTagMatch) {
          content = contentTagMatch[1].trim();
        }
        break;
      }
    }

    const confidenceRatingRegex = /<confidence>(.*?)<\/confidence>/s;
    const confidenceMatch = text.match(confidenceRatingRegex);

    if (confidenceMatch) {
      confidenceRating = confidenceMatch[1].trim();
    }

    const paragraphs = content.split(/\n+/).map(paragraph => paragraph.trim()).filter(paragraph => paragraph !== '');
    const sentences = AnswerService.parseSentences(content);

    const result = {
      answerType,
      content,
      preliminaryChecks,
      englishAnswer,
      citationHead,
      citationUrl,
      paragraphs,
      confidenceRating,
      sentences,
    };

    return result;
  },
};

export default AnswerService;
