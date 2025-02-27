import { getApiUrl } from '../utils/apiToUrl.js';
export const DataStoreService = {
  checkDatabaseConnection: async () => {
    if (process.env.REACT_APP_ENV !== 'production') {
      console.log('Skipping database connection check in development environment');
      return true;
    }

    try {
      const response = await fetch(getApiUrl("db-check"));
      if (!response.ok) {
        throw new Error('Database connection failed');
      }
      const data = await response.json();
      console.log('Database connection status:', data.message);
      return true;
    } catch (error) {
      console.error('Error checking database connection:', error);
      return false;
    }
  },

  persistInteractionSmall: async (interactionData) => {


  },
  persistInteraction: async (
    selectedAI,
    question,
    userMessageId,
    referringUrl,
    answer,
    finalCitationUrl,
    confidenceRating,
    context,
    chatId,
    lang,
    totalResponseTime,
    searchProvider
  ) => {
    const interaction = {
      selectedAI: selectedAI,
      question: question,
      referringUrl: referringUrl,
      answer: answer,
      userMessageId: userMessageId,
      finalCitationUrl: finalCitationUrl,
      confidenceRating: confidenceRating,
      context: context,
      chatId: chatId,
      pageLanguage: lang,
      responseTime: totalResponseTime,
      searchProvider: searchProvider
    };

    try {
      const response = await fetch(getApiUrl('db-persist-interaction'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(
          interaction
        ),
      });

      if (!response.ok) {
        throw new Error('Failed to log interaction');
      }

      console.log('Interaction logged successfully to database');
    } catch (error) {
      console.log('Development mode: Interaction logged to console', {
        ...interaction
      });
    }
  },
  persistFeedback: async (expertFeedback, chatId, userMessageId) => {
    // Standardize expert feedback format - only accept new format
    let formattedExpertFeedback = null;
    if (expertFeedback) {
      formattedExpertFeedback = {
        totalScore: expertFeedback.totalScore ?? null,
        sentence1Score: expertFeedback.sentence1Score ?? null,
        sentence1Explanation: expertFeedback.sentence1Explanation || '',
        sentence1Harmful: expertFeedback.sentence1Harmful || false,
        sentence2Score: expertFeedback.sentence2Score ?? null,
        sentence2Explanation: expertFeedback.sentence2Explanation || '',
        sentence2Harmful: expertFeedback.sentence2Harmful || false,
        sentence3Score: expertFeedback.sentence3Score ?? null,
        sentence3Explanation: expertFeedback.sentence3Explanation || '',
        sentence3Harmful: expertFeedback.sentence3Harmful || false,
        sentence4Score: expertFeedback.sentence4Score ?? null,
        sentence4Explanation: expertFeedback.sentence4Explanation || '',
        sentence4Harmful: expertFeedback.sentence4Harmful || false,
        citationScore: expertFeedback.citationScore ?? null,
        citationExplanation: expertFeedback.citationExplanation || '',
        answerImprovement: expertFeedback.answerImprovement || '',
        expertCitationUrl: expertFeedback.expertCitationUrl || '',
        feedback: expertFeedback.isPositive ? 'positive' : 'negative'
      };
    }
    console.log(`User feedback:`, formattedExpertFeedback);

    try {
      const response = await fetch(getApiUrl('db-persist-feedback'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chatId: chatId,
          interactionId: userMessageId,
          expertFeedback: formattedExpertFeedback
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to log interaction');
      }

      console.log('Interaction logged successfully to database');
    } catch (error) {
      console.log('Development mode: Interaction logged to console', {
        expertFeedback: formattedExpertFeedback
      });
    }

  }
};

