// Mock metrics bundle for local layout/locale preview.
// Enable by adding VITE_MOCK_METRICS=true to .env.local (already gitignored).
// Both useDashboardMetrics instances (filtered + year) return this same bundle,
// which is sufficient for visual review of all dashboard sections.
export const MOCK_METRICS = {
  firstDataDate: '2025-10-01T00:00:00.000Z',
  totalQuestions: 347,
  totalQuestionsEn: 241,
  totalQuestionsFr: 106,
  totalConversations: 203,
  totalInputTokens: 1840220,
  totalInputTokensEn: 1278540,
  totalInputTokensFr: 561680,
  totalOutputTokens: 284610,
  totalOutputTokensEn: 197820,
  totalOutputTokensFr: 86790,
  responseTime: { count: 347, median: 2340, p90: 4120, p95: 5680, max: 12440, maxChatId: 'mock-chat-id' },
  sessionsByQuestionCount: {
    singleQuestion: { total: 134 },
    twoQuestions:   { total: 47 },
    threeQuestions: { total: 22 },
  },
  expertScored: {
    total:            { total: 89, en: 62, fr: 27 },
    correct:          { total: 71, en: 49, fr: 22 },
    needsImprovement: { total: 9,  en: 7,  fr: 2  },
    hasError:         { total: 5,  en: 4,  fr: 1  },
    hasCitationError: { total: 3,  en: 2,  fr: 1  },
    harmful:          { total: 1,  en: 1,  fr: 0  },
    hasContentIssue:  { total: 7,  en: 5,  fr: 2, needsImprovement: 4, hasError: 3 },
  },
  aiScored: {
    total:            { total: 124, en: 86, fr: 38 },
    correct:          { total: 98,  en: 68, fr: 30 },
    needsImprovement: { total: 14,  en: 10, fr: 4  },
    hasError:         { total: 8,   en: 5,  fr: 3  },
    hasCitationError: { total: 4,   en: 3,  fr: 1  },
    harmful:          { total: 0,   en: 0,  fr: 0  },
  },
  publicFeedbackTotals: {
    totalQuestionsWithFeedback: 156,
    yes: 112, no: 44,
    enYes: 78, enNo: 31,
    frYes: 34, frNo: 13,
  },
  publicFeedbackReasons: {
    yes: {
      '1': { en: 15, fr: 4,  total: 19 },  // noCall
      '2': { en: 12, fr: 3,  total: 15 },  // noVisit
      '3': { en: 48, fr: 18, total: 66 },  // savedTime
      '4': { en: 8,  fr: 4,  total: 12 },  // other
    },
    no: {
      '5':  { en: 9,  fr: 3, total: 12 },  // notWanted (positive about AI)
      '6':  { en: 6,  fr: 2, total: 8  },  // other
      '7':  { en: 10, fr: 2, total: 12 },  // notDetailed
      '8':  { en: 5,  fr: 2, total: 7  },  // confusing
      '9':  { en: 3,  fr: 1, total: 4  },  // irrelevant
      '10': { en: 1,  fr: 0, total: 1  },  // brokenLink
    },
  },
  byDepartment: {
    'CRA-ARC':   { total: 89,  expertScored: { total: 34 } },
    IRCC:        { total: 67,  expertScored: { total: 28 } },
    'EDSC-ESDC': { total: 54,  expertScored: { total: 18 } },
    'HC-SC':     { total: 43,  expertScored: { total: 9  } },
    'DFO-MPO':   { total: 38,  expertScored: { total: 0  } },
    'NRCan-RNCan': { total: 31, expertScored: { total: 0  } },
    TC:          { total: 25,  expertScored: { total: 0  } },
  },
  blockedQueries: {
    total:               { total: 47, en: 34, fr: 13 },
    tooShort:            { total: 18, en: 13, fr: 5  },
    piStage1:            { total: 12, en: 9,  fr: 3  },
    piStage2:            { total: 6,  en: 4,  fr: 2  },
    profanity:           { total: 5,  en: 4,  fr: 1  },
    threat:              { total: 3,  en: 2,  fr: 1  },
    manipulation:        { total: 2,  en: 1,  fr: 1  },
    azureGuardrail:      { total: 1,  en: 1,  fr: 0  },
    unsupportedLanguage: { total: 0,  en: 0,  fr: 0  },
  },
};
