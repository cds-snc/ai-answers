import { useCallback, useEffect, useRef, useState } from 'react';
import EvalAnalysisService from '../../services/EvalAnalysisService.js';

// Hard cap on drive iterations: a full 200-eval run is ~13 steps (snapshot +
// 10 classification chunks + synthesis), so hitting this means the run is
// stuck — stop driving instead of burning LLM calls; the doc stays viewable.
const MAX_DRIVE_STEPS = 30;

// State machine for the partner dashboard "Run eval analysis" section:
// precheck (volume gates) → create → drive advance() until complete/error →
// refresh the past-runs list. Also loads stored past reports.
export function useEvalAnalysis(lang = 'en') {
  const [precheck, setPrecheck] = useState(null);
  const [precheckLoading, setPrecheckLoading] = useState(false);
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

  const runPrecheck = useCallback(async (filters) => {
    setPrecheck(null);
    if (!filters?.department) return;
    setPrecheckLoading(true);
    try {
      const result = await EvalAnalysisService.precheck(filters);
      if (!cancelledRef.current) setPrecheck(result);
    } catch (e) {
      console.error('Eval analysis precheck failed:', e);
      if (!cancelledRef.current) setPrecheck(null);
    } finally {
      if (!cancelledRef.current) setPrecheckLoading(false);
    }
  }, []);

  const runAnalysis = useCallback(async (filters) => {
    setRunError(null);
    setRunning(true);
    setAnalysis(null);
    try {
      let current = await EvalAnalysisService.create(filters, lang);
      if (!cancelledRef.current) setAnalysis(current);
      let steps = 0;
      while (
        !cancelledRef.current &&
        current.status !== 'complete' &&
        current.status !== 'error' &&
        steps < MAX_DRIVE_STEPS
      ) {
        current = await EvalAnalysisService.advance(current._id);
        steps += 1;
        if (!cancelledRef.current) {
          // Keep a previously loaded full snapshot visible while the driver
          // publishes its lighter progress responses.
          setAnalysis((previous) => current.rows ? current : { ...current, rows: previous?.rows });
        }
      }
      await refreshList(filters.department);
    } catch (e) {
      console.error('Eval analysis run failed:', e);
      if (!cancelledRef.current) setRunError(e);
    } finally {
      if (!cancelledRef.current) setRunning(false);
    }
  }, [lang, refreshList]);

  // Clear the displayed report/error — called when the applied filters
  // change so a report never lingers under a different institution's filters.
  const clearAnalysis = useCallback(() => {
    setAnalysis(null);
    setRunError(null);
  }, []);

  // Load a stored past report into the report area (no LLM calls).
  const loadAnalysis = useCallback(async (analysisId, options = {}) => {
    setRunError(null);
    setLoadingAnalysisId(analysisId);
    try {
      const stored = await EvalAnalysisService.get(analysisId, options);
      if (!cancelledRef.current) setAnalysis(stored);
    } catch (e) {
      console.error('Failed to load eval analysis:', e);
      if (!cancelledRef.current) setRunError(e);
    } finally {
      if (!cancelledRef.current) setLoadingAnalysisId(null);
    }
  }, []);

  return {
    precheck,
    precheckLoading,
    runPrecheck,
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
