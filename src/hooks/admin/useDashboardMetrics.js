import { useState, useEffect, useRef, useCallback } from 'react';
import MetricsService from '../../services/MetricsService.js';
import { MOCK_METRICS } from '../../utils/dashboard/mockMetrics.js';

const INITIAL_METRICS = {
  firstDataDate: null,
  totalQuestions: 0,
  totalQuestionsEn: 0,
  totalQuestionsFr: 0,
  totalConversations: 0,
  totalInputTokens: 0,
  totalInputTokensEn: 0,
  totalInputTokensFr: 0,
  totalOutputTokens: 0,
  totalOutputTokensEn: 0,
  totalOutputTokensFr: 0,
  responseTime: { count: 0, median: 0, p90: 0, p95: 0, max: 0, maxChatId: '' },
  sessionsByQuestionCount: {
    singleQuestion: { total: 0 },
    twoQuestions: { total: 0 },
    threeQuestions: { total: 0 },
  },
  expertScored: { total: { total: 0 }, correct: { total: 0 }, needsImprovement: { total: 0 }, hasError: { total: 0 }, hasCitationError: { total: 0 }, harmful: { total: 0, en: 0, fr: 0 }, hasContentIssue: { total: 0, en: 0, fr: 0, needsImprovement: 0, hasError: 0 } },
  aiScored: { total: { total: 0 }, correct: { total: 0 }, needsImprovement: { total: 0 }, hasError: { total: 0 }, hasCitationError: { total: 0 }, harmful: { total: 0 } },
  publicFeedbackTotals: { totalQuestionsWithFeedback: 0, yes: 0, no: 0 },
  publicFeedbackReasons: { yes: {}, no: {} },
  byDepartment: {},
  blockedQueries: {},
  topReferrals: [],
  topCitations: [],
  answerTypeBreakdown: {},
  topServices: [],
};

// Fetches the shared dashboard metric bundle (usage, sessions, expert feedback,
// public feedback, departments, technical) used by the exec and partner
// dashboards. The underlying figures are computed server-side by the metrics
// endpoints — this hook only orchestrates the fetch, abort, and loading/error
// state. Blocked-query metrics are treated as best-effort so they don't take
// down the rest of the dashboard if that endpoint fails.
//
// Call fetchMetrics(filters) with at least { startDate, endDate }; any other
// filter keys (department, userType, answerType, …) are passed straight through
// to the endpoints. The returned `metrics` is always the full shape above, so
// consumers can read fields without guarding for undefined.
// `includeReferrals` / `includeCitations` opt in to the extra partner-only
// fetches (top referral pages, top citation pages + answer-type breakdown). The
// exec dashboard omits them, so it pays nothing for lists it doesn't render.
// Like blocked queries, they're best-effort: a failure leaves an empty result
// rather than taking down the whole dashboard.
export function useDashboardMetrics(options = {}) {
  const { includeReferrals = false, includeCitations = false, includeServices = false } = options;
  const [metrics, setMetrics] = useState(INITIAL_METRICS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const abortRef = useRef(null);

  // Abort any in-flight request on unmount.
  useEffect(() => () => { if (abortRef.current) abortRef.current.abort(); }, []);

  // Accepts a filters object and passes it straight through to the metrics
  // endpoints. The exec dashboard's minimal bar supplies { startDate, endDate,
  // department }; the partner dashboard's full FilterPanel supplies the richer
  // set (userType, answerType, partnerEval, aiEval, urlEn/urlFr, …). Both are
  // serialized as query params and read by the shared parseRequestFilters.
  const fetchMetrics = useCallback(async (filters = {}) => {
    if (import.meta.env.VITE_MOCK_METRICS || new URLSearchParams(window.location.search).get('mock') === '1') {
      setMetrics(MOCK_METRICS);
      return;
    }
    if (!filters.startDate || !filters.endDate) return;

    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();
    const { signal } = abortRef.current;

    setLoading(true);
    setError(null);

    try {
      const [usage, session, expert, ai, publicFb, dept, technical] = await Promise.all([
        MetricsService.getUsageMetrics(filters, signal),
        MetricsService.getSessionMetrics(filters, signal),
        MetricsService.getExpertMetrics(filters, signal),
        MetricsService.getAiEvalMetrics(filters, signal),
        MetricsService.getPublicFeedbackMetrics(filters, signal),
        MetricsService.getDepartmentMetrics(filters, signal),
        MetricsService.getTechnicalMetrics(filters, signal),
      ]);
      // Best-effort tail fetches run together: blocked queries always, top
      // referrals / citations only when opted in. Each falls back to its empty
      // shape so one failing endpoint can't blank the rest of the dashboard.
      const [blocked, referrals, citations, services] = await Promise.all([
        MetricsService.getBlockedMetrics(filters, signal)
          .catch(() => ({ blockedQueries: INITIAL_METRICS.blockedQueries })),
        includeReferrals
          ? MetricsService.getReferralMetrics(filters, signal)
              .catch(() => ({ topReferrals: INITIAL_METRICS.topReferrals }))
          : Promise.resolve({ topReferrals: INITIAL_METRICS.topReferrals }),
        includeCitations
          ? MetricsService.getCitationMetrics(filters, signal)
              .catch(() => ({ topCitations: INITIAL_METRICS.topCitations, answerTypeBreakdown: INITIAL_METRICS.answerTypeBreakdown }))
          : Promise.resolve({ topCitations: INITIAL_METRICS.topCitations, answerTypeBreakdown: INITIAL_METRICS.answerTypeBreakdown }),
        includeServices
          ? MetricsService.getServiceMetrics(filters, signal)
              .catch(() => ({ topServices: INITIAL_METRICS.topServices }))
          : Promise.resolve({ topServices: INITIAL_METRICS.topServices }),
      ]);
      if (!signal.aborted) {
        setMetrics({ ...INITIAL_METRICS, ...usage, ...session, ...expert, ...ai, ...publicFb, ...dept, ...technical, ...blocked, ...referrals, ...citations, ...services });
      }
    } catch (err) {
      if (!signal.aborted) setError(err);
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, [includeReferrals, includeCitations, includeServices]);

  return { metrics, loading, error, fetchMetrics };
}
