import { useCallback, useEffect, useRef, useState } from 'react';
import EvalAnalysisService from '../../services/EvalAnalysisService.js';

// State for the "Eval analysis" section of the AI-assisted analysis page:
// run an analysis (one request that returns the finished report), refresh
// the past-runs list, and load stored past reports.
export function useEvalAnalysis(lang = 'en') {
  const [running, setRunning] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [runError, setRunError] = useState(null);
  const [pastRuns, setPastRuns] = useState([]);
  // Which institution `pastRuns` was last loaded for ('' = not loaded), so
  // the section can tell "no past runs" apart from "not loaded yet".
  const [pastRunsDepartment, setPastRunsDepartment] = useState('');
  // Bumped on every finished past-report load: the section's messages use it
  // as a nonce so viewing the same still-running run again re-announces.
  const [loadCount, setLoadCount] = useState(0);
  const [loadingAnalysisId, setLoadingAnalysisId] = useState(null);
  const cancelledRef = useRef(false);
  // Bumped by every run, load and clear. A run can take minutes, so a
  // response that comes back after the filters changed (or after a newer
  // run/load started) belongs to something no longer on screen: drop it
  // rather than showing it under the wrong institution.
  const requestIdRef = useRef(0);

  useEffect(() => {
    cancelledRef.current = false;
    return () => {
      cancelledRef.current = true;
    };
  }, []);

  // Resolves to the loaded list, or null when it failed or the hook unmounted.
  const refreshList = useCallback(async (department) => {
    if (!department) {
      setPastRuns([]);
      setPastRunsDepartment('');
      return null;
    }
    try {
      const analyses = (await EvalAnalysisService.list(department)) || [];
      if (cancelledRef.current) return null;
      setPastRuns(analyses);
      setPastRunsDepartment(department);
      return analyses;
    } catch (e) {
      // The list is secondary UI — a failed refresh shouldn't surface as a
      // run error; the next successful run/refresh repopulates it.
      console.error('Failed to list eval analyses:', e);
      return null;
    }
  }, []);

  const runAnalysis = useCallback(async (filters) => {
    const requestId = ++requestIdRef.current;
    const isCurrent = () => !cancelledRef.current && requestId === requestIdRef.current;
    setRunError(null);
    setRunning(true);
    setAnalysis(null);
    setLoadingAnalysisId(null);
    try {
      const result = await EvalAnalysisService.create(filters, lang);
      if (isCurrent()) setAnalysis(result);
    } catch (e) {
      console.error('Eval analysis run failed:', e);
      if (isCurrent()) setRunError(e);
    } finally {
      if (isCurrent()) setRunning(false);
    }
    // Refresh after a failure too: a request that times out can still
    // finish on the server, and the list is the only way to find that run.
    // Skipped when superseded: the list now shows another institution's runs.
    if (isCurrent()) await refreshList(filters.department);
  }, [lang, refreshList]);

  // Clear the displayed report/error — called when the applied filters
  // change so a report never lingers under a different institution's filters.
  // Also abandons any run or load in flight (the server still finishes a
  // run; it shows up in the past-runs list).
  const clearAnalysis = useCallback(() => {
    requestIdRef.current += 1;
    setAnalysis(null);
    setRunError(null);
    setRunning(false);
    setLoadingAnalysisId(null);
  }, []);

  // Load a stored past report into the report area (no LLM calls).
  const loadAnalysis = useCallback(async (analysisId) => {
    const requestId = ++requestIdRef.current;
    const isCurrent = () => !cancelledRef.current && requestId === requestIdRef.current;
    setRunError(null);
    setLoadingAnalysisId(analysisId);
    try {
      const stored = await EvalAnalysisService.get(analysisId);
      if (isCurrent()) setAnalysis(stored);
    } catch (e) {
      console.error('Failed to load eval analysis:', e);
      if (isCurrent()) setRunError(e);
    } finally {
      if (isCurrent()) {
        setLoadingAnalysisId(null);
        setLoadCount((n) => n + 1);
      }
    }
  }, []);

  return {
    running,
    analysis,
    runError,
    runAnalysis,
    pastRuns,
    pastRunsDepartment,
    refreshList,
    loadAnalysis,
    clearAnalysis,
    loadingAnalysisId,
    loadCount
  };
}

export default useEvalAnalysis;
