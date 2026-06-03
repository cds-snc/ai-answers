import { useCallback, useEffect, useRef, useState } from 'react';
import MetricsService from '../../services/MetricsService.js';

const getDefaultDateRange = () => {
  const end = new Date();
  const start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
  return {
    startDate: start.toISOString(),
    endDate: end.toISOString(),
  };
};

const initialState = {
  responseTime: { count: 0, median: 0, p90: 0, p95: 0, max: 0, maxChatId: '' },
  downloadWebPage: [],
  totalInputTokens: 0,
  totalInputTokensEn: 0,
  totalInputTokensFr: 0,
  totalOutputTokens: 0,
  totalOutputTokensEn: 0,
  totalOutputTokensFr: 0,
  totalContextInputTokens: 0,
  totalContextInputTokensEn: 0,
  totalContextInputTokensFr: 0,
  totalAnswerInputTokens: 0,
  totalAnswerInputTokensEn: 0,
  totalAnswerInputTokensFr: 0,
  totalContextOutputTokens: 0,
  totalContextOutputTokensEn: 0,
  totalContextOutputTokensFr: 0,
  totalAnswerOutputTokens: 0,
  totalAnswerOutputTokensEn: 0,
  totalAnswerOutputTokensFr: 0,
  totalGoogleSearches: 0,
  totalQuestions: 0,
};

export function useTechnicalMetrics() {
  const [data, setData] = useState(initialState);
  const [loadingState, setLoadingState] = useState({ technical: false, usage: false });
  const [errorState, setErrorState] = useState({ technical: null, usage: null });
  const [hasStartedLoading, setHasStartedLoading] = useState(false);
  const abortControllerRef = useRef(null);

  const updateLoading = useCallback((key, isLoading) => {
    setLoadingState((prev) => ({ ...prev, [key]: isLoading }));
  }, []);

  const updateError = useCallback((key, error) => {
    setErrorState((prev) => ({ ...prev, [key]: error }));
  }, []);

  const fetchAll = useCallback(
    async (filters = null) => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      abortControllerRef.current = new AbortController();
      const { signal } = abortControllerRef.current;
      const resolvedFilters = filters || getDefaultDateRange();

      setHasStartedLoading(true);
      setErrorState({ technical: null, usage: null });

      const fetchSection = async (key, fetchFn) => {
        updateLoading(key, true);
        updateError(key, null);

        try {
          const result = await fetchFn(resolvedFilters, signal);
          if (!signal.aborted) {
            setData((prev) => ({ ...prev, ...result }));
          }
        } catch (err) {
          if (!signal.aborted) {
            console.error(`${key} fetch error`, err);
            updateError(key, err.message || 'Failed to load data');
          }
        } finally {
          if (!signal.aborted) {
            updateLoading(key, false);
          }
        }
      };

      fetchSection('technical', MetricsService.getTechnicalMetrics.bind(MetricsService));
      fetchSection('usage', MetricsService.getUsageMetrics.bind(MetricsService));
    },
    [updateError, updateLoading]
  );

  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const handleApplyFilters = useCallback((filters) => fetchAll(filters), [fetchAll]);

  const handleClearFilters = useCallback(
    (defaultFilters) => fetchAll(defaultFilters || { ...getDefaultDateRange(), userType: 'public' }),
    [fetchAll]
  );

  return {
    data,
    errorState,
    handleApplyFilters,
    handleClearFilters,
    hasStartedLoading,
    loadingState,
  };
}
