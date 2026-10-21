import { useCallback, useEffect, useRef, useState } from 'react';
import { PassagesTestClientService } from '../../services/experimental/PassagesTestClientService.js';
import { probeModesForRow } from '../../utils/experimental/passagesProbe.js';

// Coveo allows 5 queries per second, possibly shared with production canada.ca
// search, so the probe starts at most 2 calls per second.
export const MIN_CALL_INTERVAL_MS = 500;

// Results the server returns without calling Coveo, so no pacing wait is needed.
const NO_CALL_REASONS = ['out_of_scope', 'not_configured'];

const wait = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

/**
 * Runs probe rows one call at a time from the browser, so each request stays short.
 * Each row runs page mode (when it has a URL) and open mode.
 */
export function usePassagesProbe() {
    const [running, setRunning] = useState(false);
    const [progress, setProgress] = useState({ done: 0, total: 0 });
    const [results, setResults] = useState([]);
    const [finished, setFinished] = useState(null); // { stopped, calls, runId } | null
    const stopRef = useRef(false);
    // Bumped per run, so a repeat of the same outcome is announced again.
    const runIdRef = useRef(0);

    useEffect(() => () => { stopRef.current = true; }, []);

    const run = useCallback(async (rows, { lang, maxPassages }) => {
        const calls = rows.flatMap((row) => probeModesForRow(row).map((mode) => ({ row, mode })));
        stopRef.current = false;
        setRunning(true);
        setFinished(null);
        setResults([]);
        setProgress({ done: 0, total: calls.length });

        let done = 0;
        for (const { row, mode } of calls) {
            if (stopRef.current) break;
            const started = Date.now();
            let result;
            try {
                result = await PassagesTestClientService.runQuery({
                    query: row.question,
                    url: mode === 'page' ? row.url : undefined,
                    lang,
                    maxPassages,
                });
            } catch (err) {
                // Keep the endpoint's status and code (e.g. 400 INVALID_QUERY) so the
                // results say why, not just that it failed.
                result = { ok: false, reason: 'request_failed', status: err.status ?? null, detail: err.code || null, passages: [] };
            }
            done += 1;
            setResults((prev) => [...prev, {
                ...result,
                question: row.question,
                citationUrl: row.url,
                goldenAnswer: row.answer,
                mode,
                lang,
                maxPassages,
            }]);
            setProgress({ done, total: calls.length });
            const elapsed = Date.now() - started;
            if (!NO_CALL_REASONS.includes(result.reason) && elapsed < MIN_CALL_INTERVAL_MS) {
                await wait(MIN_CALL_INTERVAL_MS - elapsed);
            }
        }

        setRunning(false);
        runIdRef.current += 1;
        setFinished({ stopped: stopRef.current, calls: done, runId: runIdRef.current });
    }, []);

    const stop = useCallback(() => { stopRef.current = true; }, []);

    return { run, stop, running, progress, results, finished };
}
