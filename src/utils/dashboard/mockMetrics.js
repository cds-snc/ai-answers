// Mock metrics bundle for local layout/locale preview.
// Enable by adding VITE_MOCK_METRICS=true to .env.local (already gitignored).
// The dashboard's useDashboardMetrics instance returns this same bundle,
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
  topReferrals: [
    { url: 'canada.ca/en/services/taxes/income-tax.html', count: 142 },
    { url: 'canada.ca/en/revenue-agency/services/payments.html', count: 98 },
    { url: 'canada.ca/fr/agence-revenu/services/paiements.html', count: 71 },
    { url: 'canada.ca/en/immigration-refugees-citizenship/services/study-canada.html', count: 64 },
    { url: 'canada.ca/en/employment-social-development/programs/ei.html', count: 53 },
    { url: 'canada.ca/fr/services/impots/declaration.html', count: 47 },
    { url: 'canada.ca/en/services/benefits/publicpensions/cpp.html', count: 39 },
    { url: 'canada.ca/en/health-canada/services/drugs-medication.html', count: 28 },
    { url: 'canada.ca/fr/immigration-refugies-citoyennete/services/visiter-canada.html', count: 21 },
    { url: 'canada.ca/en/services/jobs/opportunities.html', count: 14 },
  ],
  topCitations: [
    { url: 'canada.ca/en/revenue-agency/services/tax/individuals.html', count: 87 },
    { url: 'canada.ca/en/services/benefits/ei/ei-regular-benefit.html', count: 61 },
    { url: 'canada.ca/fr/agence-revenu/services/impot/particuliers.html', count: 44 },
    { url: 'canada.ca/en/immigration-refugees-citizenship/services/application.html', count: 33 },
    { url: 'canada.ca/en/services/benefits/publicpensions/cpp/cpp-benefit.html', count: 25 },
    { url: 'canada.ca/fr/services/prestations/ae.html', count: 18 },
    { url: 'canada.ca/en/health-canada/services/health-products.html', count: 11 },
  ],
  answerTypeBreakdown: {
    normal: 1240,
    'clarifying-question': 186,
    'pt-muni': 73,
    'not-gc': 41,
  },
  // Matches expertScored.hasContentIssue above: 7 total (4 needsImprovement, 3
  // hasError). Server sorts errors first, most recent within each group.
  // chatId is a UUID (crypto.randomUUID(), see ExperimentalBatchService.js);
  // interactionId is a Mongo ObjectId (interactions._id) — real-length IDs so
  // the mock preview matches production layout/wrapping.
  contentIssueChats: [
    { chatId: 'd9a9ae8f-f693-497c-b25a-b836f679f4f8', interactionId: '1c9d435778754754f0550a06', pageLanguage: 'en', createdAt: '2026-08-08T14:22:00Z', status: 'hasError' },
    { chatId: 'ff8e12ab-1d6a-419e-b105-4a7cf73103af', interactionId: '8c5d238682cb43c288f7853b', pageLanguage: 'fr', createdAt: '2026-08-07T10:05:00Z', status: 'hasError' },
    { chatId: '6a04a7c6-3f8b-4d3f-bca8-b156df9f7477', interactionId: '408cf01f3cac4d9a2792c19f', pageLanguage: 'en', createdAt: '2026-08-05T16:41:00Z', status: 'hasError' },
    { chatId: 'ecd0beb5-1f50-4a55-8a7e-bbce16027555', interactionId: 'a754d771e912da938be8b756', pageLanguage: 'en', createdAt: '2026-08-08T09:12:00Z', status: 'needsImprovement' },
    { chatId: 'e59a72ef-2d4e-4dfb-93cb-fe7456a671c5', interactionId: '31fd86f4a38c94d0f420dcd9', pageLanguage: 'en', createdAt: '2026-08-06T13:37:00Z', status: 'needsImprovement' },
    { chatId: '8498df91-7fd9-4f4c-a628-d61fcf95d696', interactionId: '5e6c6e46a95cd3ed7a239449', pageLanguage: 'fr', createdAt: '2026-08-04T11:50:00Z', status: 'needsImprovement' },
    { chatId: '39724676-4c16-4e60-9b93-b2745abe20cd', interactionId: '08bd7b1d662aa3a55baf29fb', pageLanguage: 'en', createdAt: '2026-08-02T08:29:00Z', status: 'needsImprovement' },
  ],
  // Matches expertScored.harmful.total above (1).
  harmfulChats: [
    { chatId: 'e19496bb-c253-4320-9c1f-6bbdbc73a97e', interactionId: '3f94b153ecd6fd60b20d4cab', pageLanguage: 'en', createdAt: '2026-08-07T15:03:00Z' },
  ],
};
