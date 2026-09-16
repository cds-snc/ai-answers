import { describe, expect, it } from 'vitest';
import { maskSearchSecrets, sanitizeSearchErrorForLogging } from '../search-error-redaction.js';

describe('search-error-redaction', () => {
    it('masks configured credentials and credential-bearing URL, header, and JSON fields', () => {
        const value = 'https://search.example.test?q=x&api_key=google-secret&token=coveo-secret Authorization: Bearer coveo-secret x-goog-api-key: google-secret {"access_token":"coveo-secret"}';

        const masked = maskSearchSecrets(value, ['google-secret', 'coveo-secret']);

        expect(masked).not.toContain('google-secret');
        expect(masked).not.toContain('coveo-secret');
        expect(masked).toContain('api_key=[REDACTED]');
        expect(masked).toContain('token=[REDACTED]');
        expect(masked).toContain('Authorization: Bearer [REDACTED]');
    });

    it('sanitizes both message and stack before logging', () => {
        const error = new Error('api_key=secret');
        error.stack = 'Error: api_key=secret';

        const sanitized = sanitizeSearchErrorForLogging(error, ['secret']);

        expect(JSON.stringify(sanitized)).not.toContain('secret');
    });
});
