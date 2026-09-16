const REDACTED = '[REDACTED]';

/**
 * Removes credentials from outbound-search errors before they reach logs or an
 * agent-visible failure result. Ordinary result/citation URLs are not passed to
 * this helper and remain unchanged.
 */
export function maskSearchSecrets(value, secrets = []) {
    if (!value) return value;

    let masked = String(value);
    for (const secret of secrets) {
        if (secret) masked = masked.split(secret).join(REDACTED);
    }

    return masked
        .replace(/([?&](?:key|api[_-]?key|token|access[_-]?token)=)([^&\s]+)/gi, `$1${REDACTED}`)
        .replace(/(authorization\s*[:=]\s*bearer\s+)([^\s,]+)/gi, `$1${REDACTED}`)
        .replace(/(x-(?:goog-)?api-key\s*[:=]\s*)([^\s,]+)/gi, `$1${REDACTED}`)
        .replace(/(["']?(?:key|api[_-]?key|token|access[_-]?token)["']?\s*[:=]\s*["']?)([^"',&\s}]+)/gi, `$1${REDACTED}`);
}

export function sanitizeSearchErrorForLogging(error, secrets = []) {
    if (!error) return error;

    return {
        name: error.name,
        message: maskSearchSecrets(error.message, secrets),
        code: error.code,
        status: error.status,
        stack: maskSearchSecrets(error.stack, secrets),
    };
}
