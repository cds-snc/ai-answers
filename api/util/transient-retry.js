/**
 * Shared retry for outbound network calls that fail at the transport layer.
 *
 * A dropped socket, a connection reset, or a 5xx is worth retrying: the request
 * never got a real answer, and the next attempt usually succeeds. A 404, a 403,
 * or a missing API key is not — retrying only burns latency in the answer
 * pipeline and hits the far end harder.
 *
 * This is deliberately narrower than `exponentialBackoff` in ./backoff.js, which
 * retries *every* error indiscriminately. Prefer this one for HTTP calls so a
 * permanent client error fails on the first attempt.
 */

/**
 * Node/undici socket-level failures, plus the two axios uses for its own timeout.
 * axios reports a `timeout:` overrun as ECONNABORTED, NOT ETIMEDOUT — ETIMEDOUT
 * comes from the OS when the connect itself times out. Both are listed because
 * either can surface depending on where the request died.
 */
export const TRANSIENT_ERROR_CODES = Object.freeze([
    'ECONNRESET',
    'ECONNABORTED',
    'ETIMEDOUT',
    'ECONNREFUSED',
    'EPIPE',
    'ENOTFOUND',
    'EAI_AGAIN',
    'ERR_STREAM_PREMATURE_CLOSE',
    // undici (native fetch) raises its own timeouts under these rather than the
    // POSIX names above.
    'UND_ERR_SOCKET',
    'UND_ERR_CONNECT_TIMEOUT',
    'UND_ERR_HEADERS_TIMEOUT',
    'UND_ERR_BODY_TIMEOUT',
]);

// Guards against a self-referential `cause` chain. Nothing legitimate nests this
// deep; undici uses exactly one level.
const MAX_CAUSE_DEPTH = 5;

/**
 * Every error in `error`'s cause chain, outermost first.
 *
 * Exported because a caller that wants to opt *out* of retrying a specific code
 * has to look in the same places this module does — checking only `error.code`
 * would miss a code that native fetch buried in `.cause`.
 *
 * @param {unknown} error
 * @returns {unknown[]}
 */
export function errorChain(error) {
    const chain = [];
    let current = error;
    for (let depth = 0; current && depth <= MAX_CAUSE_DEPTH; depth++) {
        chain.push(current);
        current = current.cause;
    }
    return chain;
}

/**
 * Uppercased `code` of every error in the chain, with the codeless ones dropped.
 *
 * @param {unknown} error
 * @returns {string[]}
 */
export function errorCodeChain(error) {
    return errorChain(error)
        .map((link) => String(link.code ?? '').toUpperCase())
        .filter(Boolean);
}

/**
 * True when this one error — ignoring its cause chain — looks transient.
 *
 * @param {unknown} error
 * @returns {boolean}
 */
function describesTransientFailure(error) {
    // axios puts an HTTP status on `.status` and `.response.status`; googleapis
    // can put one on `.code`. `.code` is checked last because it is usually a
    // string code ('ECONNRESET'), which would otherwise mask `.response.status`.
    const status = error.status ?? error.response?.status ?? error.code;
    // Only 5xx earns another attempt. A non-5xx status still falls through: a
    // response can start 200 and then have its body stream die, which is a
    // transport failure wearing a success status.
    if (typeof status === 'number' && status >= 500) return true;

    const code = String(error.code ?? '').toUpperCase();
    if (TRANSIENT_ERROR_CODES.includes(code)) return true;

    // Some transport failures arrive with no code at all — only a message.
    const message = String(error.message ?? '').toLowerCase();
    return (
        message.includes('premature close') ||
        message.includes('socket hang up') ||
        message.includes('network socket disconnected')
    );
}

/**
 * True when an error looks like a transient transport failure rather than a
 * deliberate rejection by the far end.
 *
 * The whole cause chain is inspected, not just the outermost error. undici — the
 * engine behind native `fetch` — reports every transport failure as a bare
 * `TypeError: fetch failed` with no `.code` at all, and puts the real socket
 * error in `.cause`. Checking only the top level classifies every native-fetch
 * failure as permanent, which silently disables retrying for any caller using
 * `fetch` instead of axios.
 *
 * Note that undici's own wrapper message ("fetch failed") is deliberately NOT
 * matched: it wraps refused connections and NXDOMAIN as readily as resets, so
 * keying on it would retry permanent failures. The nested code is the signal.
 *
 * @param {unknown} error
 * @returns {boolean}
 */
export function isTransientNetworkError(error) {
    if (!error) return false;
    return errorChain(error).some(describesTransientFailure);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Runs `fn`, retrying only while `isRetryable` says the failure was transient.
 * Delay grows linearly (baseDelayMs, 2x, 3x...) — enough to ride out a reset
 * without stalling an interactive answer.
 *
 * The last error is rethrown untouched so callers keep their existing handling.
 *
 * @param {() => Promise<T>} fn - The call to attempt.
 * @param {object} [options]
 * @param {number} [options.attempts=3] - Total attempts, including the first.
 * @param {number} [options.baseDelayMs=250] - Delay before the 2nd attempt.
 * @param {number} [options.maxElapsedMs=Infinity] - Stop retrying once this much
 *   wall-clock time has been spent. Needed because a caller whose own request
 *   timeout is long (a hung origin) would otherwise multiply that wait by
 *   `attempts`; failures that return instantly are unaffected.
 * @param {(error: unknown) => boolean} [options.isRetryable]
 * @param {(info: {error: unknown, attempt: number, attempts: number}) => void} [options.onRetry]
 * @returns {Promise<T>}
 * @template T
 */
export async function retryOnTransientError(fn, options = {}) {
    const {
        attempts = 3,
        baseDelayMs = 250,
        maxElapsedMs = Infinity,
        isRetryable = isTransientNetworkError,
        onRetry,
    } = options;

    const startedAt = Date.now();

    for (let attempt = 1; ; attempt++) {
        try {
            return await fn();
        } catch (error) {
            const outOfTime = Date.now() - startedAt >= maxElapsedMs;
            if (attempt >= attempts || outOfTime || !isRetryable(error)) throw error;
            // Same contract as exponentialBackoff's callback: best-effort
            // telemetry must never break the retry loop, or a throwing callback
            // would replace the network error with its own and defeat the
            // caller's error mapping.
            if (onRetry) {
                try { onRetry({ error, attempt, attempts }); } catch (_e) { /* never let a callback break the pipeline */ }
            }
            await sleep(baseDelayMs * attempt);
        }
    }
}
