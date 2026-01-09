import AuthService from './AuthService.js';
import { getApiUrl } from '../utils/apiToUrl.js';

class MetricsService {
  static async getChatLogs(filters = {}, limit = 100, lastId = null) {
    try {
      const queryParams = new URLSearchParams({ ...filters, limit, lastId }).toString();
      const response = await AuthService.fetch(getApiUrl(`db-chat-logs?${queryParams}`));
      if (!response.ok) throw new Error('Failed to get chat logs');
      return await response.json();
    } catch (error) {
      console.error('Error getting chat logs:', error);
      throw error;
    }
  }

  /**
   * Fetch pre-calculated metrics from server (memory-optimized)
   * @param {Object} filters - Filter options (startDate, endDate, timezoneOffsetMinutes)
   * @returns {Promise<Object>} Pre-calculated metrics object
   */
  static async getCalculatedMetrics(filters = {}) {
    try {
      const queryParams = new URLSearchParams(filters).toString();
      const response = await AuthService.fetch(getApiUrl(`db-metrics-dashboard?${queryParams}`));
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to get calculated metrics');
      }
      const data = await response.json();
      return data.metrics;
    } catch (error) {
      console.error('Error getting calculated metrics:', error);
      throw error;
    }
  }



  static calculateMetrics = (logs) => {
    // Use a local Set to track unique chatIds
    const uniqueChatIds = new Set();
    const uniqueChatIdsEn = new Set();
    const uniqueChatIdsFr = new Set();

    // Initialize metrics object
    const metrics = {
      totalSessions: logs.length,
      totalQuestions: 0,
      totalQuestionsEn: 0,
      totalQuestionsFr: 0,
      totalConversations: 0,
      totalConversationsEn: 0,
      totalConversationsFr: 0,
      totalGoogleSearches: 0,
      totalInputTokens: 0,
      totalInputTokensEn: 0,
      totalInputTokensFr: 0,
      totalOutputTokens: 0,
      totalOutputTokensEn: 0,
      totalOutputTokensFr: 0,
      sessionsByQuestionCount: {
        singleQuestion: { total: 0, en: 0, fr: 0 },
        twoQuestions: { total: 0, en: 0, fr: 0 },
        threeQuestions: { total: 0, en: 0, fr: 0 }
      },
      answerTypes: {
        normal: { total: 0, en: 0, fr: 0 },
        'clarifying-question': { total: 0, en: 0, fr: 0 },
        'pt-muni': { total: 0, en: 0, fr: 0 },
        'not-gc': { total: 0, en: 0, fr: 0 }
      },
      expertScored: {
        total: { total: 0, en: 0, fr: 0 },
        correct: { total: 0, en: 0, fr: 0 },
        needsImprovement: { total: 0, en: 0, fr: 0 },
        hasError: { total: 0, en: 0, fr: 0 },
        hasCitationError: { total: 0, en: 0, fr: 0 },
        harmful: { total: 0, en: 0, fr: 0 }
      },
      userScored: {
        total: { total: 0, en: 0, fr: 0 },
        helpful: { total: 0, en: 0, fr: 0 },
        unhelpful: { total: 0, en: 0, fr: 0 }
      },
      aiScored: {
        total: { total: 0, en: 0, fr: 0 },
        correct: { total: 0, en: 0, fr: 0 },
        needsImprovement: { total: 0, en: 0, fr: 0 },
        hasError: { total: 0, en: 0, fr: 0 },
        hasCitationError: { total: 0, en: 0, fr: 0 },
        harmful: { total: 0, en: 0, fr: 0 }
      },
      byDepartment: {},
      publicFeedbackReasons: {
        yes: {},
        no: {},
      },
      publicFeedbackTotals: {
        yes: 0,
        no: 0,
        totalQuestionsWithFeedback: 0,
        enYes: 0,
        enNo: 0,
        frYes: 0,
        frNo: 0,
      },
      publicFeedbackScores: {},
      publicFeedbackReasonsByLang: { en: {}, fr: {} }
    };

    // Process each chat document
    logs.forEach(chat => {
      // Track unique chatIds from the chat document
      if (chat.chatId) {
        uniqueChatIds.add(chat.chatId);
        if (chat.pageLanguage === 'en') uniqueChatIdsEn.add(chat.chatId);
        if (chat.pageLanguage === 'fr') uniqueChatIdsFr.add(chat.chatId);
      }

      // Count Google searches
      if (chat.searchProvider === 'google') {
        metrics.totalGoogleSearches++;
      }

      // Count questions for this session
      const questionCount = chat.interactions?.length || 0;
      const pageLanguage = chat.pageLanguage || 'en';

      if (questionCount === 1) {
        metrics.sessionsByQuestionCount.singleQuestion.total++;
        if (pageLanguage === 'en') metrics.sessionsByQuestionCount.singleQuestion.en++;
        if (pageLanguage === 'fr') metrics.sessionsByQuestionCount.singleQuestion.fr++;
      } else if (questionCount === 2) {
        metrics.sessionsByQuestionCount.twoQuestions.total++;
        if (pageLanguage === 'en') metrics.sessionsByQuestionCount.twoQuestions.en++;
        if (pageLanguage === 'fr') metrics.sessionsByQuestionCount.twoQuestions.fr++;
      } else if (questionCount === 3) {
        metrics.sessionsByQuestionCount.threeQuestions.total++;
        if (pageLanguage === 'en') metrics.sessionsByQuestionCount.threeQuestions.en++;
        if (pageLanguage === 'fr') metrics.sessionsByQuestionCount.threeQuestions.fr++;
      }

      // Process each interaction in the chat
      chat.interactions?.forEach(interaction => {
        // Count total questions
        metrics.totalQuestions++;
        if (pageLanguage === 'en') metrics.totalQuestionsEn++;
        if (pageLanguage === 'fr') metrics.totalQuestionsFr++;

        // Count input tokens from all sources (context, answer)
        const contextInputTokens = Number(interaction.context?.inputTokens) || 0;
        const answerInputTokens = Number(interaction.answer?.inputTokens) || 0;
        const totalInputTokens = contextInputTokens + answerInputTokens;

        if (totalInputTokens > 0) {
          metrics.totalInputTokens += totalInputTokens;
          if (pageLanguage === 'en') metrics.totalInputTokensEn += totalInputTokens;
          if (pageLanguage === 'fr') metrics.totalInputTokensFr += totalInputTokens;
        }

        // Count output tokens from all sources (context, answer)
        const contextOutputTokens = Number(interaction.context?.outputTokens) || 0;
        const answerOutputTokens = Number(interaction.answer?.outputTokens) || 0;
        const totalOutputTokens = contextOutputTokens + answerOutputTokens;

        if (totalOutputTokens > 0) {
          metrics.totalOutputTokens += totalOutputTokens;
          if (pageLanguage === 'en') metrics.totalOutputTokensEn += totalOutputTokens;
          if (pageLanguage === 'fr') metrics.totalOutputTokensFr += totalOutputTokens;
        }

        // Count answer types (per language)
        if (interaction.answer?.answerType) {
          const answerType = interaction.answer.answerType;
          if (Object.prototype.hasOwnProperty.call(metrics.answerTypes, answerType)) {
            metrics.answerTypes[answerType].total++;
            if (pageLanguage === 'en') metrics.answerTypes[answerType].en++;
            if (pageLanguage === 'fr') metrics.answerTypes[answerType].fr++;
          }
        }

        // Get department
        const department = interaction.context?.department || 'Unknown';

        // Initialize department metrics if not exists
        if (!metrics.byDepartment[department]) {
          metrics.byDepartment[department] = {
            total: 0,
            expertScored: {
              total: 0,
              correct: 0,
              needsImprovement: 0,
              hasError: 0
            },
            userScored: {
              total: 0,
              helpful: 0,
              unhelpful: 0
            }
          };
        }

        // Count department interactions
        metrics.byDepartment[department].total++;

        // Process expert feedback
        if (interaction.expertFeedback) {
          // Defensive: ensure all expertScored properties exist before incrementing
          ['total', 'correct', 'needsImprovement', 'hasError', 'hasCitationError', 'harmful'].forEach(key => {
            if (!metrics.expertScored[key]) metrics.expertScored[key] = { total: 0, en: 0, fr: 0 };
            if (!metrics.byDepartment[department].expertScored[key] && key !== 'harmful' && key !== 'hasCitationError') metrics.byDepartment[department].expertScored[key] = 0;
          });
          metrics.expertScored.total.total++;
          if (pageLanguage === 'en') metrics.expertScored.total.en++;
          if (pageLanguage === 'fr') metrics.expertScored.total.fr++;
          metrics.byDepartment[department].expertScored.total++;

          // Check for citation errors first (separate category)
          let hasCitationError = false;
          if (interaction.expertFeedback.citationScore !== null && interaction.expertFeedback.citationScore === 0) {
            hasCitationError = true;
          }

          // Update expert feedback calculations for sentence errors
          const feedbackFields = [
            { score: interaction.expertFeedback.sentence1Score, harmful: interaction.expertFeedback.sentence1Harmful },
            { score: interaction.expertFeedback.sentence2Score, harmful: interaction.expertFeedback.sentence2Harmful },
            { score: interaction.expertFeedback.sentence3Score, harmful: interaction.expertFeedback.sentence3Harmful },
            { score: interaction.expertFeedback.sentence4Score, harmful: interaction.expertFeedback.sentence4Harmful },
          ];

          let highestCategory = null;
          feedbackFields.forEach(({ score, harmful }) => {
            if (harmful) {
              highestCategory = 'harmful';
            } else if (score === 0 && highestCategory !== 'harmful') {
              highestCategory = 'hasError';
            } else if (score === 80 && highestCategory !== 'harmful' && highestCategory !== 'hasError') {
              highestCategory = 'needsImprovement';
            }
          });

          // Include citationScore for non-error scoring (but not as hasError)
          if (interaction.expertFeedback.citationScore !== null && !hasCitationError) {
            const citationScore = interaction.expertFeedback.citationScore;
            if (citationScore === 20 && highestCategory !== 'hasError') {
              highestCategory = 'needsImprovement';
            } else if (citationScore === 25 && highestCategory === null) {
              highestCategory = 'correct';
            }
          }

          // Categorize based on priority: harmful > hasCitationError > hasError > needsImprovement > correct
          if (highestCategory === 'harmful') {
            metrics.expertScored.harmful.total++;
            if (pageLanguage === 'en') metrics.expertScored.harmful.en++;
            if (pageLanguage === 'fr') metrics.expertScored.harmful.fr++;
          } else if (hasCitationError) {
            metrics.expertScored.hasCitationError.total++;
            if (pageLanguage === 'en') metrics.expertScored.hasCitationError.en++;
            if (pageLanguage === 'fr') metrics.expertScored.hasCitationError.fr++;
          } else if (highestCategory === 'hasError') {
            metrics.expertScored.hasError.total++;
            if (pageLanguage === 'en') metrics.expertScored.hasError.en++;
            if (pageLanguage === 'fr') metrics.expertScored.hasError.fr++;
            metrics.byDepartment[department].expertScored.hasError++;
          } else if (highestCategory === 'needsImprovement') {
            metrics.expertScored.needsImprovement.total++;
            if (pageLanguage === 'en') metrics.expertScored.needsImprovement.en++;
            if (pageLanguage === 'fr') metrics.expertScored.needsImprovement.fr++;
            metrics.byDepartment[department].expertScored.needsImprovement++;
          } else {
            metrics.expertScored.correct.total++;
            if (pageLanguage === 'en') metrics.expertScored.correct.en++;
            if (pageLanguage === 'fr') metrics.expertScored.correct.fr++;
            metrics.byDepartment[department].expertScored.correct++;
          }
        }

        // Process user feedback
        if (interaction.userFeedback) {
          // Defensive: ensure all userScored properties exist before incrementing
          ['total', 'helpful', 'unhelpful'].forEach(key => {
            if (!metrics.userScored[key]) metrics.userScored[key] = { total: 0, en: 0, fr: 0 };
            if (!metrics.byDepartment[department].userScored[key]) metrics.byDepartment[department].userScored[key] = 0;
          });
          metrics.userScored.total.total++;
          if (pageLanguage === 'en') metrics.userScored.total.en++;
          if (pageLanguage === 'fr') metrics.userScored.total.fr++;
          metrics.byDepartment[department].userScored.total++;

          if (interaction.userFeedback.rating === 'helpful') {
            metrics.userScored.helpful.total++;
            if (pageLanguage === 'en') metrics.userScored.helpful.en++;
            if (pageLanguage === 'fr') metrics.userScored.helpful.fr++;
            metrics.byDepartment[department].userScored.helpful++;
          } else if (interaction.userFeedback.rating === 'unhelpful') {
            metrics.userScored.unhelpful.total++;
            if (pageLanguage === 'en') metrics.userScored.unhelpful.en++;
            if (pageLanguage === 'fr') metrics.userScored.unhelpful.fr++;
            metrics.byDepartment[department].userScored.unhelpful++;
          }
        }

        // Process AI self-assessment
        if (interaction.autoEval?.expertFeedback) {
          // Defensive: ensure all aiScored properties exist before incrementing
          ['total', 'correct', 'needsImprovement', 'hasError', 'hasCitationError', 'harmful'].forEach(key => {
            if (!metrics.aiScored[key]) metrics.aiScored[key] = { total: 0, en: 0, fr: 0 };
          });
          metrics.aiScored.total.total++;
          if (pageLanguage === 'en') metrics.aiScored.total.en++;
          if (pageLanguage === 'fr') metrics.aiScored.total.fr++;

          // Check for citation errors first (separate category)
          let hasCitationError = false;
          if (interaction.autoEval.expertFeedback.citationScore !== null && interaction.autoEval.expertFeedback.citationScore === 0) {
            hasCitationError = true;
          }

          const feedbackFields = [
            { score: interaction.autoEval.expertFeedback.sentence1Score, harmful: interaction.autoEval.expertFeedback.sentence1Harmful },
            { score: interaction.autoEval.expertFeedback.sentence2Score, harmful: interaction.autoEval.expertFeedback.sentence2Harmful },
            { score: interaction.autoEval.expertFeedback.sentence3Score, harmful: interaction.autoEval.expertFeedback.sentence3Harmful },
            { score: interaction.autoEval.expertFeedback.sentence4Score, harmful: interaction.autoEval.expertFeedback.sentence4Harmful },
          ];

          // Update AI scoring logic to match expert feedback scoring
          let highestCategory = null;
          feedbackFields.forEach(({ score, harmful }) => {
            if (harmful) {
              highestCategory = 'harmful';
            } else if (score === 0 && highestCategory !== 'harmful') {
              highestCategory = 'hasError';
            } else if (score === 80 && highestCategory !== 'harmful' && highestCategory !== 'hasError') {
              highestCategory = 'needsImprovement';
            }
          });

          // Include citationScore for non-error scoring (but not as hasError)
          if (interaction.autoEval.expertFeedback.citationScore !== null && !hasCitationError) {
            const citationScore = interaction.autoEval.expertFeedback.citationScore;
            if (citationScore === 20 && highestCategory !== 'hasError') {
              highestCategory = 'needsImprovement';
            } else if (citationScore === 25 && highestCategory === null) {
              highestCategory = 'correct';
            }
          }

          // Categorize based on priority: harmful > hasCitationError > hasError > needsImprovement > correct
          if (highestCategory === 'harmful') {
            metrics.aiScored.harmful.total++;
            if (pageLanguage === 'en') metrics.aiScored.harmful.en++;
            if (pageLanguage === 'fr') metrics.aiScored.harmful.fr++;
          } else if (hasCitationError) {
            metrics.aiScored.hasCitationError.total++;
            if (pageLanguage === 'en') metrics.aiScored.hasCitationError.en++;
            if (pageLanguage === 'fr') metrics.aiScored.hasCitationError.fr++;
          } else if (highestCategory === 'hasError') {
            metrics.aiScored.hasError.total++;
            if (pageLanguage === 'en') metrics.aiScored.hasError.en++;
            if (pageLanguage === 'fr') metrics.aiScored.hasError.fr++;
          } else if (highestCategory === 'needsImprovement') {
            metrics.aiScored.needsImprovement.total++;
            if (pageLanguage === 'en') metrics.aiScored.needsImprovement.en++;
            if (pageLanguage === 'fr') metrics.aiScored.needsImprovement.fr++;
          } else {
            metrics.aiScored.correct.total++;
            if (pageLanguage === 'en') metrics.aiScored.correct.en++;
            if (pageLanguage === 'fr') metrics.aiScored.correct.fr++;
          }
        }

        // Process public feedback
        if (interaction.publicFeedback) {
          const feedbackType = interaction.publicFeedback.feedback === 'yes' ? 'yes' : 'no';
          const reason = interaction.publicFeedback.publicFeedbackReason || 'other';

          // Count by reason and feedback type
          if (!metrics.publicFeedbackReasons[feedbackType][reason]) {
            metrics.publicFeedbackReasons[feedbackType][reason] = 0;
          }
          metrics.publicFeedbackReasons[feedbackType][reason]++;

          // Increment totals
          metrics.publicFeedbackTotals[feedbackType]++;
          metrics.publicFeedbackTotals.totalQuestionsWithFeedback++;

          // Increment language-specific yes/no counts
          if (chat.pageLanguage === 'en') {
            if (feedbackType === 'yes') {
              metrics.publicFeedbackTotals.enYes++;
            } else {
              metrics.publicFeedbackTotals.enNo++;
            }
          } else if (chat.pageLanguage === 'fr') {
            if (feedbackType === 'yes') {
              metrics.publicFeedbackTotals.frYes++;
            } else {
              metrics.publicFeedbackTotals.frNo++;
            }
          }
        }
      });
    });

    // Set total conversations based on unique chatIds
    metrics.totalConversations = uniqueChatIds.size;
    metrics.totalConversationsEn = uniqueChatIdsEn.size;
    metrics.totalConversationsFr = uniqueChatIdsFr.size;

    return metrics;
  };
}

export default MetricsService;
