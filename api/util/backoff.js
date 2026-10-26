// `onRetry(error, retriesRemaining)`, if provided, is called just before each
// retry attempt — not awaited, and never allowed to throw, so a caller can use
// it for best-effort telemetry (e.g. ServiceCallMetricsService.recordRetry)
// without affecting retry timing or behavior.
export async function exponentialBackoff(fn, retries = 3, baseDelay = 1000, onRetry) {
    try {
        return await fn();
    } catch (error) {
        if (retries <= 0) {
            throw error;
        }
        if (onRetry) {
            try { onRetry(error, retries); } catch (_e) { /* never let a callback break the pipeline */ }
        }
        const delay = baseDelay * (Math.pow(2, 3 - retries)); // 1000, 2000, 4000
        await new Promise(resolve => setTimeout(resolve, delay));
        return exponentialBackoff(fn, retries - 1, baseDelay, onRetry);
    }
}
