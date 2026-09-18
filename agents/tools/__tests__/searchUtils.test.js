import { describe, expect, it } from 'vitest';
import { maskSecretValue, sanitizeErrorForLogging } from '../utils/searchUtils.js';

describe('searchUtils', () => {
    it('masks query-string keys, bearer tokens, and API key values', () => {
        const value = 'https://search.test?q=x&key=secret123 Bearer bearer123 apiKey: api123';

        const masked = maskSecretValue(value);

        expect(masked).toBe('https://search.test?q=x&key=[REDACTED] Bearer [REDACTED] apiKey: [REDACTED]');
        expect(masked).not.toContain('secret123');
        expect(masked).not.toContain('bearer123');
        expect(masked).not.toContain('api123');
    });

    it('sanitizes the error fields used by provider logging', () => {
        const error = Object.assign(new Error('request failed?key=secret123'), {
            code: 'ERR',
            status: 500,
        });

        expect(sanitizeErrorForLogging(error)).toMatchObject({
            message: 'request failed?key=[REDACTED]',
            code: 'ERR',
            status: 500,
        });
    });
});
