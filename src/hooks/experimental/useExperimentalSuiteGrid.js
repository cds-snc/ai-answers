import { useCallback, useEffect, useState } from 'react';
import { ExperimentalBatchClientService } from '../../services/experimental/ExperimentalBatchClientService.js';

/**
 * Loads the suite grid for a dataset: tests (columns), runs (rows) and
 * the verdict cell matrix.
 */
export function useExperimentalSuiteGrid(datasetId) {
    const [dataset, setDataset] = useState(null);
    const [tests, setTests] = useState([]);
    const [runs, setRuns] = useState([]);
    const [cells, setCells] = useState({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const load = useCallback(async () => {
        if (!datasetId) return;
        setLoading(true);
        setError(null);
        try {
            const result = await ExperimentalBatchClientService.getSuiteGrid(datasetId);
            setDataset(result.dataset || null);
            setTests(result.tests || []);
            setRuns(result.runs || []);
            setCells(result.cells || {});
        } catch (err) {
            console.error('Failed to load suite grid:', err);
            setError(err.message || 'load-failed');
        } finally {
            setLoading(false);
        }
    }, [datasetId]);

    useEffect(() => {
        load();
    }, [load]);

    return { dataset, tests, runs, cells, loading, error, reload: load };
}

export default useExperimentalSuiteGrid;
