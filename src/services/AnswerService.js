// src/ClaudeService.js

import loadSystemPrompt from './systemPrompt.js';
import { getProviderApiUrl } from '../utils/apiToUrl.js';

const AnswerService = {
  prepareMessage: async (
    provider,
    message,
    conversationHistory = [],
    lang = 'en',
    context,
    evaluation = false,
    referringUrl
  ) => {
    console.log(`🤖 AnswerService: Processing message in ${lang.toUpperCase()}`);

    const SYSTEM_PROMPT = await loadSystemPrompt(lang, context);
    if (evaluation) {
      message = '<evaluation>' + message + '</evaluation>';
    }
    // Only change: check for evaluation and use empty array if true
    const finalHistory = message.includes('<evaluation>') ? [] : conversationHistory;
    const messageWithReferrer = `${message}${referringUrl.trim() ? `\n<referring-url>${referringUrl.trim()}</referring-url>` : ''}`;
    console.log('Sending to ' + provider + ' API:', {
      messageWithReferrer,
      conversationHistory: finalHistory,
      systemPromptLength: SYSTEM_PROMPT.length,
    });

    return {
      message: messageWithReferrer,
      conversationHistory: finalHistory,
      systemPrompt: SYSTEM_PROMPT,
    };
  },

  sendMessage: async (
    provider,
    message,
    conversationHistory = [],
    lang = 'en',
    context,
    evaluation,
    referringUrl
  ) => {
    try {
      const messagePayload = await AnswerService.prepareMessage(
        provider,
        message,
        conversationHistory,
        lang,
        context,
        evaluation,
        referringUrl
      );
      const response = await fetch(getProviderApiUrl(provider, 'message'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(messagePayload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(provider + ' API error response:', errorText);
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      console.log(provider + ' API response:', data);
      const parsedResponse = AnswerService.parseResponse(data.content);
      const mergedResponse = { ...data, ...parsedResponse };
      return mergedResponse;
    } catch (error) {
      console.error('Error calling ' + provider + ' API:', error);
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
    let englishQuestion = '';

    // Extract preliminary checks - this regex needs to capture multiline content
    let questionLanguage = '';
    const preliminaryMatch = /<preliminary-checks>([\s\S]*?)<\/preliminary-checks>/s.exec(text);
    if (preliminaryMatch) {
      preliminaryChecks = preliminaryMatch[1].trim();
      content = content.replace(/<preliminary-checks>[\s\S]*?<\/preliminary-checks>/s, '').trim();
      questionLanguage = /<question-language>(.*?)<\/question-language>/s
        .exec(preliminaryChecks)[1]
        .trim();
      const englishQuestionMatch = /<english-question>(.*?)<\/english-question>/s.exec(
        preliminaryChecks
      );
      englishQuestion = englishQuestionMatch ? englishQuestionMatch[1].trim() : '';
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
    content = content.replace(/<citation-head>[\s\S]*?<\/citation-head>/s, '').trim();
    content = content.replace(/<citation-url>[\s\S]*?<\/citation-url>/s, '').trim();

    // Check response types
    if (content.includes('<not-gc>')) {
      answerType = 'not-gc';
      content = content.replace(/<\/?not-gc>/g, '').trim();
    } else if (content.includes('<pt-muni>')) {
      answerType = 'pt-muni';
      content = content.replace(/<\/?p?-?pt-muni>/g, '').trim();
    } else if (content.includes('<clarifying-question>')) {
      answerType = 'question';
      content = content.replace(/<\/?clarifying-question>/g, '').trim();
    }
    const confidenceRatingRegex = /<confidence>(.*?)<\/confidence>/s;
    const confidenceMatch = text.match(confidenceRatingRegex);

    if (confidenceMatch) {
      confidenceRating = confidenceMatch[1].trim();
    }

    const paragraphs = content.split(/\n+/);
    const sentences = AnswerService.parseSentences(content);

    return {
      answerType,
      content,
      preliminaryChecks,
      englishAnswer,
      citationHead,
      citationUrl,
      paragraphs,
      confidenceRating,
      sentences,
      questionLanguage,
      englishQuestion,
    };
  },

  sendBatchMessages: async (provider, entries, lang, batchName) => {
    try {
      console.log(
        `🤖 AnswerService: Processing batch of ${entries.length} entries in ${lang.toUpperCase()}`
      );
      const batchEntries = await Promise.all(
        entries.map(async (entry) => {
          const context = {
            topic: entry['CONTEXT.TOPIC'],
            topicUrl: entry['CONTEXT.TOPICURL'],
            department: entry['CONTEXT.DEPARTMENT'],
            departmentUrl: entry['CONTEXT.DEPARTMENTURL'],
            searchResults: entry['CONTEXT.SEARCHRESULTS'],
            searchProvider: entry['CONTEXT.SEARCHPROVIDER'],
            model: entry['CONTEXT.MODEL'],
            inputTokens: entry['CONTEXT.INPUTTOKENS'],
            outputTokens: entry['CONTEXT.OUTPUTTOKENS'],
          };
          const referringUrl = entry['REFERRINGURL'] || '';
          const messagePayload = await AnswerService.prepareMessage(
            provider,
            entry.REDACTEDQUESTION,
            [],
            lang,
            context,
            true,
            referringUrl
          );
          messagePayload.context = context;
          return messagePayload;
        })
      );

      const response = await fetch(getProviderApiUrl(provider, 'batch'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          requests: batchEntries,
          lang: lang,
          batchName: batchName,
          provider: provider,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create batch request');
      }

      return response.json();
    } catch (error) {
      console.error('Error in sendBatchMessages:', error);
      throw error;
    }
  },
};

export default AnswerService;
