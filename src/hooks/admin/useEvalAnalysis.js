import { useCallback, useEffect, useRef, useState } from 'react';
import EvalAnalysisService from '../../services/EvalAnalysisService.js';

// State for the partner dashboard "Run eval analysis" section: run an
// analysis (one request that returns the finished report), refresh the
// past-runs list, and load stored past reports.
export function useEvalAnalysis(lang = 'en') {
  const [running, setRunning] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [runError, setRunError] = useState(null);
  const [pastRuns, setPastRuns] = useState([]);
  const [loadingAnalysisId, setLoadingAnalysisId] = useState(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;
    return () => {
      cancelledRef.current = true;
    };
  }, []);

  const refreshList = useCallback(async (department) => {
    if (!department) {
      setPastRuns([]);
      return;
    }
    try {
      const analyses = await EvalAnalysisService.list(department);
      if (!cancelledRef.current) setPastRuns(analyses || []);
    } catch (e) {
      // The list is secondary UI — a failed refresh shouldn't surface as a
      // run error; the next successful run/refresh repopulates it.
      console.error('Failed to list eval analyses:', e);
    }
  }, []);

  const runAnalysis = useCallback(async (filters) => {
    setRunError(null);
    setRunning(true);
    setAnalysis(null);
    try {
      const result = await EvalAnalysisService.create(filters, lang);
      if (!cancelledRef.current) setAnalysis(result);
    } catch (e) {
      console.error('Eval analysis run failed:', e);
      if (!cancelledRef.current) setRunError(e);
    } finally {
      if (!cancelledRef.current) setRunning(false);
    }
    // Refresh after a failure too: a request that times out can still
    // finish on the server, and the list is the only way to find that run.
    await refreshList(filters.department);
  }, [lang, refreshList]);

  // Clear the displayed report/error — called when the applied filters
  // change so a report never lingers under a different institution's filters.
  const clearAnalysis = useCallback(() => {
    setAnalysis(null);
    setRunError(null);
  }, []);

  // Load a stored past report into the report area (no LLM calls).
  const loadAnalysis = useCallback(async (analysisId) => {
    setRunError(null);
    setLoadingAnalysisId(analysisId);
    try {
      const stored = await EvalAnalysisService.get(analysisId);
      if (!cancelledRef.current) setAnalysis(stored);
    } catch (e) {
      console.error('Failed to load eval analysis:', e);
      if (!cancelledRef.current) setRunError(e);
    } finally {
      if (!cancelledRef.current) setLoadingAnalysisId(null);
    }
  }, []);

  return {
    running,
    analysis,
    runError,
    runAnalysis,
    pastRuns,
    refreshList,
    loadAnalysis,
    clearAnalysis,
    loadingAnalysisId
  };
}

export default useEvalAnalysis;
