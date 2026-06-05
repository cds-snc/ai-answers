import { useState, useEffect, useRef, useCallback } from 'react';
import MetricsService from '../../services/MetricsService.js';

const INITIAL_METRICS = {
  totalQuestions: 0,
  totalQuestionsEn: 0,
  totalQuestionsFr: 0,
  totalConversations: 0,
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
};

// Fetches the shared dashboard metric bundle (usage, sessions, expert feedback,
// public feedback, departments) used by the exec and partner dashboards. The
// underlying figures are computed server-side by the metrics endpoints — this
// hook only orchestrates the parallel fetch, abort, and loading/error state.
//
// Call fetchMetrics(filters) with at least { startDate, endDate }; any other
// filter keys (department, userType, answerType, …) are passed straight through
// to the endpoints. The returned `metrics` is always the full shape above, so
// consumers can read fields without guarding for undefined.
export function useDashboardMetrics() {
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
    if (!filters.startDate || !filters.endDate) return;

    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();
    const { signal } = abortRef.current;

    setLoading(true);
    setError(null);

    try {
      const [usage, session, expert, ai, publicFb, dept] = await Promise.all([
        MetricsService.getUsageMetrics(filters, signal),
        MetricsService.getSessionMetrics(filters, signal),
        MetricsService.getExpertMetrics(filters, signal),
        MetricsService.getAiEvalMetrics(filters, signal),
        MetricsService.getPublicFeedbackMetrics(filters, signal),
        MetricsService.getDepartmentMetrics(filters, signal),
      ]);
      if (!signal.aborted) {
        setMetrics({ ...INITIAL_METRICS, ...usage, ...session, ...expert, ...ai, ...publicFb, ...dept });
      }
    } catch (err) {
      if (!signal.aborted) setError(err);
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, []);

  return { metrics, loading, error, fetchMetrics };
}
