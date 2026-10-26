/**
 * Redacts API keys and bearer tokens from text before it is logged or returned.
 *
 * Search errors can include the request URL or authorization header, so keep
 * this at the search-tool boundary rather than relying on each provider's
 * error shape.
 *
 * @param {unknown} text
 * @returns {unknown}
 */
function maskSecretValue(text) {
    if (!text) return text;

    return String(text)
        .replace(/([?&]key=)([^&\s]+)/gi, '$1[REDACTED]')
        .replace(/(Bearer\s+)([^,\s]+)/gi, '$1[REDACTED]')
        .replace(/((?:api[-_ ]?key)\s*[:=]\s*)([^,\s]+)/gi, '$1[REDACTED]');
}

/**
 * Keeps provider errors useful for diagnostics without logging request secrets.
 *
 * @param {unknown} error
 * @returns {object|unknown}
 */
function sanitizeErrorForLogging(error) {
    if (!error) return error;

    return {
        name: error.name,
        message: maskSecretValue(error.message),
        code: error.code,
        status: error.status,
        stack: maskSecretValue(error.stack),
    };
}

export { maskSecretValue, sanitizeErrorForLogging };
