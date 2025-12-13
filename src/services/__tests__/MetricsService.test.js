import { describe, it, expect } from 'vitest';
import MetricsService from '../MetricsService.js';

describe('MetricsService.calculateMetrics', () => {
  it('counts answerTypes and tokens and language correctly', () => {
    const logs = [
      {
        chatId: 'chat1',
        pageLanguage: 'en',
        searchProvider: 'google',
        interactions: [
          {
            context: { department: 'HR', pageLanguage: 'en' },
            answer: { answerType: 'normal', inputTokens: 10, outputTokens: 20 },
            expertFeedback: null,
            userFeedback: null,
            autoEval: null
          }
        ]
      }
    ];

    const metrics = MetricsService.calculateMetrics(logs);
    expect(metrics.totalSessions).toBe(1);
    expect(metrics.totalQuestions).toBe(1);
    expect(metrics.totalGoogleSearches).toBe(1);
    expect(metrics.totalInputTokens).toBe(10);
    expect(metrics.totalOutputTokens).toBe(20);
    expect(metrics.answerTypes.normal.total).toBe(1);
    expect(metrics.totalConversations).toBe(1);
    expect(metrics.byDepartment['HR'].total).toBe(1);
  });

  it('categorizes expertFeedback and ai autoEval correctly', () => {
    const logs = [
      {
        chatId: 'chat2',
        pageLanguage: 'fr',
        interactions: [
          {
            context: { department: 'IT', pageLanguage: 'fr' },
            answer: { answerType: 'clarifying-question', inputTokens: 5, outputTokens: 5 },
            expertFeedback: {
              citationScore: 25,
              sentence1Score: 100,
              sentence1Harmful: false,
              sentence2Score: 80,
              sentence2Harmful: false,
              sentence3Score: 80,
              sentence3Harmful: false,
              sentence4Score: 80,
              sentence4Harmful: false
            },
            autoEval: {
              expertFeedback: {
                citationScore: 20,
                sentence1Score: 80,
                sentence1Harmful: false,
                sentence2Score: 0,
                sentence2Harmful: false
              }
            }
          }
        ]
      }
    ];

    const metrics = MetricsService.calculateMetrics(logs);
    // expertFeedback in this sample has a sentence with score 80 -> needsImprovement
    expect(metrics.expertScored.needsImprovement.total).toBe(1);
    // ai autoEval in this sample contains a sentence with score 0 -> hasError
    expect(metrics.aiScored.hasError.total).toBe(1);
    // language counts
    expect(metrics.totalQuestionsFr).toBe(1);
    expect(metrics.answerTypes['clarifying-question'].fr).toBe(1);
  });
});
